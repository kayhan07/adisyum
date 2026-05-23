'use client';

import { isRuntimeAuthRequired, runtimeFetch } from '@/lib/runtime/runtime-api';

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
const LOCAL_WRITE_REFRESH_GRACE_MS = 8000;
const TABLE_RUNTIME_KEYS = [
	'aurelia-table-payment-requested',
	'aurelia-table-live-totals',
	'aurelia-table-meta',
	'aurelia-table-state-sync-meta',
] as const;
const TABLE_STATE_META_KEY = 'aurelia-table-state-sync-meta';
const lastLocalWriteAt: Record<RuntimeScope, number> = {
	tenant: 0,
	'system-admin': 0,
};
const dirtyScopes: Record<RuntimeScope, boolean> = {
	tenant: false,
	'system-admin': false,
};
const persistInFlight: Record<RuntimeScope, boolean> = {
	tenant: false,
	'system-admin': false,
};

function isRuntimeStateAuthFailure(error: unknown) {
	return error instanceof Error && /sync unauthorized with (401|403)/.test(error.message);
}

function areSnapshotsEqual(first: RuntimeSnapshot, second: RuntimeSnapshot) {
	const firstKeys = Object.keys(first);
	const secondKeys = Object.keys(second);
	if (firstKeys.length !== secondKeys.length) return false;
	return firstKeys.every((key) => first[key] === second[key]);
}

function readTableSnapshotVersion(snapshot: RuntimeSnapshot) {
	const raw = snapshot[TABLE_STATE_META_KEY];
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { version?: unknown; updatedAtMs?: unknown; clientId?: unknown; mutationId?: unknown; source?: unknown };
		const version = Number(parsed.version);
		const updatedAtMs = Number(parsed.updatedAtMs);
		if (!Number.isFinite(version) || !Number.isFinite(updatedAtMs)) return null;
		return {
			version,
			updatedAtMs,
			clientId: typeof parsed.clientId === 'string' ? parsed.clientId : 'unknown',
			mutationId: typeof parsed.mutationId === 'string' ? parsed.mutationId : 'unknown',
			source: typeof parsed.source === 'string' ? parsed.source : 'unknown',
		};
	} catch {
		return null;
	}
}

function mergeIncomingSnapshot(scope: RuntimeScope, incoming: RuntimeSnapshot, source: string) {
	if (scope !== 'tenant') return incoming;
	const localMeta = readTableSnapshotVersion(snapshots[scope]);
	const incomingMeta = readTableSnapshotVersion(incoming);
	const localIsNewer =
		Boolean(localMeta) &&
		(!incomingMeta ||
			(localMeta?.version ?? 0) > incomingMeta.version ||
			((localMeta?.version ?? 0) === incomingMeta.version && (localMeta?.updatedAtMs ?? 0) > incomingMeta.updatedAtMs));

	if (!localIsNewer) return incoming;

	const merged = { ...incoming };
	for (const key of TABLE_RUNTIME_KEYS) {
		if (snapshots[scope][key] !== undefined) {
			merged[key] = snapshots[scope][key];
		}
	}
	console.info('[runtime-state] stale table snapshot rejected', {
		scope,
		source,
		localMeta,
		incomingMeta,
		preservedKeys: TABLE_RUNTIME_KEYS.filter((key) => snapshots[scope][key] !== undefined),
	});
	return merged;
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
		if (dirtyScopes[scope] || persistInFlight[scope] || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS) {
			console.info('[runtime-state] broadcast snapshot ignored during local mutation', {
				scope,
				dirty: dirtyScopes[scope],
				persistInFlight: persistInFlight[scope],
				ageMs: Date.now() - lastLocalWriteAt[scope],
			});
			return;
		}
		const nextSnapshot = mergeIncomingSnapshot(scope, { ...event.data.snapshot }, 'broadcast');
		if (areSnapshotsEqual(snapshots[scope], nextSnapshot)) return;
		snapshots[scope] = nextSnapshot;
		emit(scope);
	};
	channels.set(scope, channel);
	return channel;
}

function broadcast(scope: RuntimeScope) {
	getChannel(scope)?.postMessage({ snapshot: snapshots[scope] });
}

async function requestSnapshot(scope: RuntimeScope, method: 'GET' | 'POST' | 'DELETE', state?: RuntimeSnapshot) {
	if (isRuntimeAuthRequired()) {
		throw new Error(`Runtime ${scope} sync stopped: AUTH_REQUIRED.`);
	}
	const response = await runtimeFetch(`/api/runtime/state/${scope}` as `/api/${string}`, {
		method,
		cache: 'no-store',
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
	if (isRuntimeAuthRequired()) return;
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
	if (options.persist !== false) {
		dirtyScopes[scope] = true;
	}

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
	if (isRuntimeAuthRequired()) return snapshots[scope];
	const existing = bootstrapPromises.get(scope);
	if (existing) return existing;

	const promise = requestSnapshot(scope, 'GET')
		.then((snapshot) => {
			if (dirtyScopes[scope] || persistInFlight[scope] || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS) {
				console.info('[runtime-state] bootstrap snapshot ignored during local mutation', {
					scope,
					dirty: dirtyScopes[scope],
					persistInFlight: persistInFlight[scope],
					ageMs: Date.now() - lastLocalWriteAt[scope],
				});
				return snapshots[scope];
			}
			const nextSnapshot = mergeIncomingSnapshot(scope, snapshot, 'bootstrap');
			if (areSnapshotsEqual(snapshots[scope], nextSnapshot)) return snapshots[scope];
			snapshots[scope] = nextSnapshot;
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
	if (isRuntimeAuthRequired()) return snapshots[scope];
	if (dirtyScopes[scope] || persistInFlight[scope] || pendingFlushes.has(scope) || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS) {
		console.info('[runtime-state] refresh skipped during local mutation', {
			scope,
			dirty: dirtyScopes[scope],
			persistInFlight: persistInFlight[scope],
			pendingFlush: pendingFlushes.has(scope),
			ageMs: Date.now() - lastLocalWriteAt[scope],
		});
		return snapshots[scope];
	}
	try {
		const snapshot = await requestSnapshot(scope, 'GET');
		if (dirtyScopes[scope] || persistInFlight[scope] || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS) return snapshots[scope];
		const nextSnapshot = mergeIncomingSnapshot(scope, snapshot, 'refresh');
		if (areSnapshotsEqual(snapshots[scope], nextSnapshot)) return snapshots[scope];
		snapshots[scope] = nextSnapshot;
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
	if (isRuntimeAuthRequired()) return snapshots[scope];
	persistInFlight[scope] = true;
	try {
		const next = await requestSnapshot(scope, 'POST', snapshots[scope]);
		dirtyScopes[scope] = false;
		const nextSnapshot = mergeIncomingSnapshot(scope, next, 'persist-response');
		if (Date.now() - lastLocalWriteAt[scope] >= LOCAL_WRITE_REFRESH_GRACE_MS && !areSnapshotsEqual(snapshots[scope], nextSnapshot)) {
			snapshots[scope] = nextSnapshot;
			emit(scope);
			broadcast(scope);
		}
		return snapshots[scope];
	} catch (error) {
		dirtyScopes[scope] = !isRuntimeStateAuthFailure(error);
		console.warn('[runtime-state] persist failed; keeping local snapshot', {
			scope,
			retrySuppressed: isRuntimeStateAuthFailure(error),
			error,
		});
		return snapshots[scope];
	} finally {
		persistInFlight[scope] = false;
	}
}

export async function clearRuntimeScope(scope: RuntimeScope) {
	snapshots[scope] = {};
	dirtyScopes[scope] = false;
	emit(scope);
	broadcast(scope);

	if (typeof window !== 'undefined') {
		await requestSnapshot(scope, 'DELETE').catch((error) => {
			console.warn('[runtime-state] clear failed after local reset', { scope, error });
		});
	}
}
