'use client';

import { isRuntimeAuthRequired, runtimeFetch } from '@/lib/runtime/runtime-api';
import { loadSessionState } from '@/lib/session-store';

export type RuntimeScope = 'tenant' | 'system-admin';

type RuntimeSnapshot = Record<string, string>;
type RuntimeListener = () => void;
type RuntimeSnapshotMeta = {
	tenantId: string;
	branchId: string | null;
	tenantCode?: string | null;
	branchName?: string | null;
	scope: RuntimeScope;
	runtimeScope: RuntimeScope;
	snapshotVersion?: number;
	snapshotTimestamp?: string;
};

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
const channels = new Map<string, BroadcastChannel>();
const activeTenantIds: Record<RuntimeScope, string> = {
	tenant: 'anonymous',
	'system-admin': 'system-admin',
};
const LOCAL_WRITE_REFRESH_GRACE_MS = 8000;
const TABLE_RUNTIME_KEYS = [
	'aurelia-table-payment-requested',
	'aurelia-table-live-totals',
	'aurelia-table-meta',
	'aurelia-table-state-sync-meta',
] as const;
const TABLE_STATE_META_KEY = 'aurelia-table-state-sync-meta';
const SNAPSHOT_META_KEY = '__adisyumRuntimeSnapshotMeta';
const LARGE_RUNTIME_SNAPSHOT_BYTES = 512_000;
const TENANT_ID_JSON_FIELD_PATTERN = /"(?:tenantId|tenant_id)"\s*:\s*"([^"]+)"/g;
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

function snapshotBytes(snapshot: RuntimeSnapshot) {
	try {
		return JSON.stringify(snapshot).length;
	} catch {
		return -1;
	}
}

function runtimeTimestamp() {
	return new Date().toISOString();
}

function runtimeDiagnostics(scope: RuntimeScope, extra: Record<string, unknown> = {}) {
	const snapshot = snapshots[scope];
	const bytes = snapshotBytes(snapshot);
	return {
		scope,
		runtimeScope: scope,
		tenantId: activeTenantIds[scope],
		runtimeSnapshotVersion: readTableSnapshotVersion(snapshot)?.version ?? null,
		snapshotKeyCount: Object.keys(snapshot).length,
		snapshotBytes: bytes,
		pendingFlush: pendingFlushes.has(scope),
		persistInFlight: persistInFlight[scope],
		dirty: dirtyScopes[scope],
		channelCount: channels.size,
		timestamp: runtimeTimestamp(),
		...extra,
	};
}

function warnLargeRuntimeSnapshot(scope: RuntimeScope, operation: string) {
	const bytes = snapshotBytes(snapshots[scope]);
	if (bytes <= LARGE_RUNTIME_SNAPSHOT_BYTES) return;
	console.warn('[runtime-state] large runtime snapshot detected', runtimeDiagnostics(scope, {
		operation,
		snapshotBytes: bytes,
		largeRuntimeSnapshotBytes: LARGE_RUNTIME_SNAPSHOT_BYTES,
	}));
}

function areSnapshotsEqual(first: RuntimeSnapshot, second: RuntimeSnapshot) {
	const firstKeys = Object.keys(first);
	const secondKeys = Object.keys(second);
	if (firstKeys.length !== secondKeys.length) return false;
	return firstKeys.every((key) => first[key] === second[key]);
}

function stableSnapshotSignature(snapshot: RuntimeSnapshot) {
	return Object.entries(snapshot)
		.filter(([key]) => key !== SNAPSHOT_META_KEY)
		.sort(([first], [second]) => first.localeCompare(second))
		.map(([key, value]) => `${key}:${value}`)
		.join('|');
}

function stableSnapshotVersion(snapshot: RuntimeSnapshot) {
	let hash = 0;
	const signature = stableSnapshotSignature(snapshot);
	for (let index = 0; index < signature.length; index += 1) {
		hash = ((hash << 5) - hash + signature.charCodeAt(index)) | 0;
	}
	return Math.abs(hash);
}

function currentScopeIdentity(scope: RuntimeScope) {
	if (scope === 'system-admin') return 'system-admin';
	const session = loadSessionState();
	return session.isAuthenticated && session.tenantId ? session.tenantId : 'anonymous';
}

function currentBranchIdentity(scope: RuntimeScope) {
	if (scope === 'system-admin') return 'system';
	const session = loadSessionState();
	return session.isAuthenticated
		? session.activeBranchId || session.currentUser.branchId || null
		: null;
}

function ensureScopeIdentity(scope: RuntimeScope) {
	const currentIdentity = currentScopeIdentity(scope);
	if (activeTenantIds[scope] === currentIdentity) return;

	const pending = pendingFlushes.get(scope);
	if (pending) {
		globalThis.clearTimeout(pending);
		pendingFlushes.delete(scope);
	}

	for (const [key, channel] of channels.entries()) {
		if (key.startsWith(`${scope}:`)) {
			channel.close();
			channels.delete(key);
		}
	}

	snapshots[scope] = {};
	dirtyScopes[scope] = false;
	persistInFlight[scope] = false;
	lastLocalWriteAt[scope] = 0;
	bootstrapPromises.delete(scope);
	activeTenantIds[scope] = currentIdentity;

	console.info('[runtime-state] scope identity changed; local snapshot cleared', runtimeDiagnostics(scope, {
		currentIdentity,
	}));
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

function parseRuntimeSnapshotMeta(snapshot: RuntimeSnapshot): Partial<RuntimeSnapshotMeta> | null {
	const raw = snapshot[SNAPSHOT_META_KEY];
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const tenantId = typeof parsed.tenantId === 'string'
			? parsed.tenantId
			: typeof parsed.snapshotTenantId === 'string'
				? parsed.snapshotTenantId
				: '';
		const branchId = typeof parsed.branchId === 'string'
			? parsed.branchId
			: typeof parsed.snapshotBranchId === 'string'
				? parsed.snapshotBranchId
				: null;
		const scope = typeof parsed.scope === 'string'
			? parsed.scope
			: typeof parsed.snapshotScope === 'string'
				? parsed.snapshotScope
				: undefined;
		const runtimeScope = typeof parsed.runtimeScope === 'string' ? parsed.runtimeScope : scope;
		return {
			tenantId,
			branchId,
			tenantCode: typeof parsed.tenantCode === 'string' ? parsed.tenantCode : null,
			branchName: typeof parsed.branchName === 'string' ? parsed.branchName : null,
			scope: scope === 'tenant' || scope === 'system-admin' ? scope : undefined,
			runtimeScope: runtimeScope === 'tenant' || runtimeScope === 'system-admin' ? runtimeScope : undefined,
			snapshotVersion: Number.isFinite(Number(parsed.snapshotVersion)) ? Number(parsed.snapshotVersion) : undefined,
			snapshotTimestamp: typeof parsed.snapshotTimestamp === 'string' ? parsed.snapshotTimestamp : undefined,
		};
	} catch {
		return null;
	}
}

function buildRuntimeSnapshotMeta(scope: RuntimeScope, snapshot: RuntimeSnapshot, incoming?: Partial<RuntimeSnapshotMeta> | null): RuntimeSnapshotMeta {
	const session = loadSessionState();
	const tenantId = scope === 'system-admin'
		? 'system-admin'
		: incoming?.tenantId || (session.isAuthenticated ? session.tenantId : activeTenantIds[scope]);
	const branchId = scope === 'system-admin'
		? 'system'
		: incoming?.branchId ?? currentBranchIdentity(scope);
	return {
		tenantId,
		branchId,
		tenantCode: incoming?.tenantCode ?? null,
		branchName: incoming?.branchName ?? (scope === 'tenant' ? session.currentUser.branch : null),
		scope,
		runtimeScope: scope,
		snapshotVersion: incoming?.snapshotVersion ?? stableSnapshotVersion(snapshot),
		snapshotTimestamp: incoming?.snapshotTimestamp ?? 'normalized',
	};
}

function normalizeIncomingSnapshotMeta(scope: RuntimeScope, incoming: RuntimeSnapshot): { snapshot: RuntimeSnapshot; meta: RuntimeSnapshotMeta } {
	const parsed = parseRuntimeSnapshotMeta(incoming);
	const meta = buildRuntimeSnapshotMeta(scope, incoming, parsed);
	const normalized: RuntimeSnapshot = {
		...incoming,
		[SNAPSHOT_META_KEY]: JSON.stringify(meta),
	};
	return { snapshot: normalized, meta };
}

function snapshotIdentityMatches(scope: RuntimeScope, meta: RuntimeSnapshotMeta): { ok: true; activeTenantId: string; activeBranchId: string | null } | { ok: false; reason: 'tenant_mismatch' | 'branch_mismatch'; activeTenantId: string; activeBranchId: string | null } {
	if (scope === 'system-admin') {
		const ok = meta.tenantId === 'system-admin' && meta.runtimeScope === 'system-admin';
		return ok
			? { ok: true, activeTenantId: 'system-admin', activeBranchId: 'system' }
			: { ok: false, reason: 'tenant_mismatch', activeTenantId: 'system-admin', activeBranchId: 'system' };
	}
	const activeTenantId = activeTenantIds[scope];
	const activeBranchId = currentBranchIdentity(scope);
	if (activeTenantId && activeTenantId !== 'anonymous' && meta.tenantId && meta.tenantId !== activeTenantId) {
		return { ok: false, reason: 'tenant_mismatch' as const, activeTenantId, activeBranchId };
	}
	if (activeBranchId && meta.branchId && meta.branchId !== activeBranchId) {
		return { ok: false, reason: 'branch_mismatch' as const, activeTenantId, activeBranchId };
	}
	return { ok: true as const, activeTenantId, activeBranchId };
}

function mergeIncomingSnapshot(scope: RuntimeScope, incoming: RuntimeSnapshot, source: string) {
	if (scope !== 'tenant') return incoming;
	const normalized = normalizeIncomingSnapshotMeta(scope, incoming);
	const identity = snapshotIdentityMatches(scope, normalized.meta);
	if (!identity.ok) {
		console.error('[tenant-drift] runtime snapshot rejected for tenant mismatch', runtimeDiagnostics(scope, {
			source,
			reason: identity.reason,
			snapshotTenantId: normalized.meta.tenantId,
			snapshotBranchId: normalized.meta.branchId,
			activeTenantId: identity.activeTenantId,
			activeBranchId: identity.activeBranchId,
		}));
		return snapshots[scope];
	}
	const foreignTenantIds = findForeignTenantIds(normalized.snapshot, activeTenantIds[scope]);
	if (foreignTenantIds.length > 0) {
		console.error('[tenant-drift] runtime snapshot rejected for tenant mismatch', runtimeDiagnostics(scope, {
			source,
			foreignTenantIds,
		}));
		return snapshots[scope];
	}
	const localMeta = readTableSnapshotVersion(snapshots[scope]);
	const incomingMeta = readTableSnapshotVersion(normalized.snapshot);
	const localIsNewer =
		Boolean(localMeta) &&
		(!incomingMeta ||
			(localMeta?.version ?? 0) > incomingMeta.version ||
			((localMeta?.version ?? 0) === incomingMeta.version && (localMeta?.updatedAtMs ?? 0) > incomingMeta.updatedAtMs));

	if (!localIsNewer) return normalized.snapshot;

	const merged = { ...normalized.snapshot };
	for (const key of TABLE_RUNTIME_KEYS) {
		if (snapshots[scope][key] !== undefined) {
			merged[key] = snapshots[scope][key];
		}
	}
	console.info('[runtime-state] stale table snapshot rejected', runtimeDiagnostics(scope, {
		source,
		localMeta,
		incomingMeta,
		preservedKeys: TABLE_RUNTIME_KEYS.filter((key) => snapshots[scope][key] !== undefined),
	}));
	return merged;
}

function findForeignTenantIds(snapshot: RuntimeSnapshot, currentTenantId: string) {
	if (!currentTenantId || currentTenantId === 'anonymous') return [];
	const foreign = new Set<string>();
	for (const [key, value] of Object.entries(snapshot)) {
		if (key === SNAPSHOT_META_KEY) continue;
		TENANT_ID_JSON_FIELD_PATTERN.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = TENANT_ID_JSON_FIELD_PATTERN.exec(value)) !== null) {
			const tenantId = match[1]?.trim();
			if (tenantId && tenantId !== currentTenantId && tenantId !== 'anonymous') {
				foreign.add(tenantId);
			}
		}
	}
	return Array.from(foreign);
}

function mergePreservingVolatileLocalKeys(scope: RuntimeScope, incoming: RuntimeSnapshot) {
	if (scope !== 'tenant') return incoming;
	const merged = { ...incoming };
	for (const key of TABLE_RUNTIME_KEYS) {
		if (snapshots[scope][key] !== undefined) {
			merged[key] = snapshots[scope][key];
		}
	}
	if (areSnapshotsEqual(merged, incoming)) return incoming;
	return merged;
}

function emit(scope: RuntimeScope) {
	listeners[scope].forEach((listener) => listener());
}

function getChannel(scope: RuntimeScope) {
	if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
	ensureScopeIdentity(scope);
	const channelKey = `${scope}:${activeTenantIds[scope]}`;
	const existing = channels.get(channelKey);
	if (existing) return existing;

	const channel = new BroadcastChannel(`adisyum-runtime:${channelKey}`);
	channel.onmessage = (event: MessageEvent<{ snapshot?: RuntimeSnapshot }>) => {
		ensureScopeIdentity(scope);
		if (!event.data?.snapshot || typeof event.data.snapshot !== 'object') return;
		if (dirtyScopes[scope] || persistInFlight[scope] || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS) {
			console.info('[runtime-state] broadcast snapshot ignored during local mutation', runtimeDiagnostics(scope, {
				ageMs: Date.now() - lastLocalWriteAt[scope],
			}));
			return;
		}
		const nextSnapshot = mergeIncomingSnapshot(scope, { ...event.data.snapshot }, 'broadcast');
		if (areSnapshotsEqual(snapshots[scope], nextSnapshot)) return;
		snapshots[scope] = nextSnapshot;
		emit(scope);
	};
	channels.set(channelKey, channel);
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
		body: method === 'POST' ? JSON.stringify({ state: state ? normalizeIncomingSnapshotMeta(scope, state).snapshot : state }) : undefined,
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
	ensureScopeIdentity(scope);
	return { ...snapshots[scope] };
}

export function readRuntimeItem(scope: RuntimeScope, key: string) {
	ensureScopeIdentity(scope);
	return snapshots[scope][key] ?? null;
}

export function writeRuntimeItem(scope: RuntimeScope, key: string, value: string | null | undefined, options: { persist?: boolean } = {}) {
	ensureScopeIdentity(scope);
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
		warnLargeRuntimeSnapshot(scope, 'write');
		schedulePersist(scope);
	}
}

export function removeRuntimeItem(scope: RuntimeScope, key: string, options?: { persist?: boolean }) {
	writeRuntimeItem(scope, key, null, options);
}

export function subscribeRuntimeScope(scope: RuntimeScope, callback: RuntimeListener) {
	ensureScopeIdentity(scope);
	listeners[scope].add(callback);
	return () => {
		listeners[scope].delete(callback);
	};
}

export async function bootstrapRuntimeScope(scope: RuntimeScope) {
	if (typeof window === 'undefined') return {};
	ensureScopeIdentity(scope);
	if (isRuntimeAuthRequired()) return snapshots[scope];
	const existing = bootstrapPromises.get(scope);
	if (existing) return existing;

	const promise = requestSnapshot(scope, 'GET')
		.then((snapshot) => {
			if (dirtyScopes[scope] || persistInFlight[scope] || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS) {
				console.info('[runtime-state] bootstrap snapshot ignored during local mutation', runtimeDiagnostics(scope, {
					ageMs: Date.now() - lastLocalWriteAt[scope],
				}));
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
			console.warn('[runtime-state] bootstrap failed; keeping local snapshot', runtimeDiagnostics(scope, { error }));
			return snapshots[scope];
		})
		.finally(() => {
			bootstrapPromises.delete(scope);
		});

	bootstrapPromises.set(scope, promise);
	return promise;
}

export async function refreshRuntimeScope(scope: RuntimeScope, options: { force?: boolean; preserveLocalRuntimeKeys?: boolean } = {}) {
	if (typeof window === 'undefined') return snapshots[scope];
	ensureScopeIdentity(scope);
	if (isRuntimeAuthRequired()) return snapshots[scope];
	const localMutationActive = dirtyScopes[scope] || persistInFlight[scope] || pendingFlushes.has(scope) || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS;
	if (localMutationActive && !options.force) {
		console.info('[runtime-state] refresh skipped during local mutation', runtimeDiagnostics(scope, {
			ageMs: Date.now() - lastLocalWriteAt[scope],
		}));
		return snapshots[scope];
	}
	const refreshStartedAt = Date.now();
	try {
		const snapshot = await requestSnapshot(scope, 'GET');
		if (!options.force && (dirtyScopes[scope] || persistInFlight[scope] || Date.now() - lastLocalWriteAt[scope] < LOCAL_WRITE_REFRESH_GRACE_MS)) return snapshots[scope];
		const incoming = options.preserveLocalRuntimeKeys ? mergePreservingVolatileLocalKeys(scope, snapshot) : snapshot;
		const nextSnapshot = mergeIncomingSnapshot(scope, incoming, options.force ? 'forced-refresh' : 'refresh');
		if (areSnapshotsEqual(snapshots[scope], nextSnapshot)) return snapshots[scope];
		snapshots[scope] = nextSnapshot;
		emit(scope);
		broadcast(scope);
		console.info('[runtime-state] refresh applied', runtimeDiagnostics(scope, {
			durationMs: Date.now() - refreshStartedAt,
		}));
		return snapshot;
	} catch (error) {
		console.warn('[runtime-state] refresh failed; keeping local snapshot', runtimeDiagnostics(scope, {
			durationMs: Date.now() - refreshStartedAt,
			error,
		}));
		return snapshots[scope];
	}
}

export async function persistRuntimeScope(scope: RuntimeScope) {
	if (typeof window === 'undefined') return snapshots[scope];
	ensureScopeIdentity(scope);
	if (isRuntimeAuthRequired()) return snapshots[scope];
	persistInFlight[scope] = true;
	warnLargeRuntimeSnapshot(scope, 'persist');
	const persistStartedAt = Date.now();
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
		const authFailure = isRuntimeStateAuthFailure(error);
		dirtyScopes[scope] = !authFailure;
		if (authFailure) {
			const pending = pendingFlushes.get(scope);
			if (pending) {
				globalThis.clearTimeout(pending);
				pendingFlushes.delete(scope);
			}
		}
		console.warn('[runtime-state] persist failed; keeping local snapshot', runtimeDiagnostics(scope, {
			retrySuppressed: authFailure,
			authRequired: authFailure,
			durationMs: Date.now() - persistStartedAt,
			error,
		}));
		return snapshots[scope];
	} finally {
		persistInFlight[scope] = false;
	}
}

export async function clearRuntimeScope(scope: RuntimeScope) {
	ensureScopeIdentity(scope);
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
