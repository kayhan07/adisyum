'use client';

export type RuntimeScope = 'tenant' | 'system-admin';

type RuntimeSnapshot = Record<string, string>;
type RuntimeListener = () => void;

const snapshots: Record<RuntimeScope, RuntimeSnapshot> = {
	tenant: {},
	'system-admin': {},
};

const listeners: Record<RuntimeScope, Set<RuntimeListener>> = {
	tenant: new Set<RuntimeListener>(),
	'system-admin': new Set<RuntimeListener>(),
};

const pendingFlushes = new Map<RuntimeScope, ReturnType<typeof globalThis.setTimeout>>();
const bootstrapPromises = new Map<RuntimeScope, Promise<Record<string, string>>>();
const channels = new Map<RuntimeScope, BroadcastChannel>();
const lastLocalWriteAt: Record<RuntimeScope, number> = {
	tenant: 0,
	'system-admin': 0,
};

function areSnapshotsEqual(first: RuntimeSnapshot, second: RuntimeSnapshot) {
	const firstKeys = Object.keys(first);
	const secondKeys = Object.keys(second);
	if (firstKeys.length !== secondKeys.length) return false;
	return firstKeys.every((key) => first[key] === second[key]);
}

function emit(scope: RuntimeScope) {
	listeners[scope].forEach((listener) => listener());
}

function getChannel(scope: RuntimeScope) {
	if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
	const existing = channels.get(scope);
	if (existing) return existing;

	const channel = new BroadcastChannel(`adisyum-runtime:${scope}`);
	channel.onmessage = (event: MessageEvent<{ snapshot?: RuntimeSnapshot }>) => {
		if (!event.data?.snapshot || typeof event.data.snapshot !== 'object') return;
		if (Date.now() - lastLocalWriteAt[scope] < 750) return;
		snapshots[scope] = { ...event.data.snapshot };
		emit(scope);
	};
	channels.set(scope, channel);
	return channel;
}

function broadcast(scope: RuntimeScope) {
	getChannel(scope)?.postMessage({ snapshot: snapshots[scope] });
}

async function requestSnapshot(scope: RuntimeScope, method: 'GET' | 'POST' | 'DELETE', state?: RuntimeSnapshot) {
	const response = await fetch(`/api/runtime/state/${scope}`, {
		method,
		cache: 'no-store',
		credentials: 'include',
		headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
		body: method === 'POST' ? JSON.stringify({ state }) : undefined,
	});

	if (response.status === 401 || response.status === 403) {
		throw new Error(`Runtime ${scope} sync unauthorized with ${response.status}.`);
	}

	if (!response.ok) {
		throw new Error(`Runtime ${scope} sync failed with ${response.status}.`);
	}

	const payload = (await response.json().catch(() => null)) as { state?: unknown } | null;
	return payload?.state && typeof payload.state === 'object'
		? Object.fromEntries(
				Object.entries(payload.state).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
			)
		: {};
}

function schedulePersist(scope: RuntimeScope) {
	if (typeof window === 'undefined') return;
	const existing = pendingFlushes.get(scope);
	if (existing) globalThis.clearTimeout(existing);
	pendingFlushes.set(
		scope,
		globalThis.setTimeout(() => {
			pendingFlushes.delete(scope);
			void persistRuntimeScope(scope);
		}, 250),
	);
}

export function getRuntimeSnapshot(scope: RuntimeScope) {
	return { ...snapshots[scope] };
}

export function readRuntimeItem(scope: RuntimeScope, key: string) {
	return snapshots[scope][key] ?? null;
}

export function writeRuntimeItem(scope: RuntimeScope, key: string, value: string | null | undefined, options: { persist?: boolean } = {}) {
	const previous = snapshots[scope][key];
	if ((value === null || value === undefined) && previous === undefined) {
		return;
	}
	if (typeof value === 'string' && previous === value) {
		return;
	}

	if (value === null || value === undefined) {
		delete snapshots[scope][key];
	} else {
		snapshots[scope][key] = value;
	}
	lastLocalWriteAt[scope] = Date.now();

	emit(scope);
	broadcast(scope);

	if (options.persist !== false) {
		schedulePersist(scope);
	}
}

export function removeRuntimeItem(scope: RuntimeScope, key: string, options?: { persist?: boolean }) {
	writeRuntimeItem(scope, key, null, options);
}

export function subscribeRuntimeScope(scope: RuntimeScope, callback: RuntimeListener) {
	listeners[scope].add(callback);
	return () => {
		listeners[scope].delete(callback);
	};
}

export async function bootstrapRuntimeScope(scope: RuntimeScope) {
	if (typeof window === 'undefined') return {};
	const existing = bootstrapPromises.get(scope);
	if (existing) return existing;

	const promise = requestSnapshot(scope, 'GET')
		.then((snapshot) => {
			if (Date.now() - lastLocalWriteAt[scope] < 750) return snapshots[scope];
			if (areSnapshotsEqual(snapshots[scope], snapshot)) return snapshots[scope];
			snapshots[scope] = snapshot;
			emit(scope);
			broadcast(scope);
			return snapshot;
		})
		.catch((error) => {
			console.warn('[runtime-state] bootstrap failed; keeping local snapshot', { scope, error });
			return snapshots[scope];
		})
		.finally(() => {
			bootstrapPromises.delete(scope);
		});

	bootstrapPromises.set(scope, promise);
	return promise;
}

export async function refreshRuntimeScope(scope: RuntimeScope) {
	if (typeof window === 'undefined') return snapshots[scope];
	try {
		const snapshot = await requestSnapshot(scope, 'GET');
		if (Date.now() - lastLocalWriteAt[scope] < 750) return snapshots[scope];
		if (areSnapshotsEqual(snapshots[scope], snapshot)) return snapshots[scope];
		snapshots[scope] = snapshot;
		emit(scope);
		broadcast(scope);
		return snapshot;
	} catch (error) {
		console.warn('[runtime-state] refresh failed; keeping local snapshot', { scope, error });
		return snapshots[scope];
	}
}

export async function persistRuntimeScope(scope: RuntimeScope) {
	if (typeof window === 'undefined') return snapshots[scope];
	try {
		const next = await requestSnapshot(scope, 'POST', snapshots[scope]);
		if (Date.now() - lastLocalWriteAt[scope] >= 750 && !areSnapshotsEqual(snapshots[scope], next)) {
			snapshots[scope] = next;
			emit(scope);
			broadcast(scope);
		}
		return snapshots[scope];
	} catch (error) {
		console.warn('[runtime-state] persist failed; keeping local snapshot', { scope, error });
		return snapshots[scope];
	}
}

export async function clearRuntimeScope(scope: RuntimeScope) {
	snapshots[scope] = {};
	emit(scope);
	broadcast(scope);

	if (typeof window !== 'undefined') {
		await requestSnapshot(scope, 'DELETE').catch((error) => {
			console.warn('[runtime-state] clear failed after local reset', { scope, error });
		});
	}
}
