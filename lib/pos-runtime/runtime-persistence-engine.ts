'use client';

import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';
import {
  getTableLiveTotals,
  setTableLiveTotals,
  setTablePaymentRequested,
} from '@/lib/table-payment-state';
import { emitRuntimeEvent } from '@/lib/pos-runtime/runtime-event-bus';

export type PersistenceVersion = {
  version: number;
  updatedAtMs: number;
  clientId: string;
};

export type RuntimePersistenceSnapshot<T = unknown> = {
  scope: 'tenant' | 'system-admin';
  key: string;
  value: T;
  version: PersistenceVersion;
};

export type RuntimeReplayEvent = {
  id: string;
  type: 'snapshot_restore' | 'mutation_replay_prepare';
  snapshotKey?: string;
  queuedAt: string;
  payload?: Record<string, unknown>;
};

export type PersistenceHydrationResult<T = unknown> = {
  restored: boolean;
  snapshot?: RuntimePersistenceSnapshot<T>;
  reason?: string;
};

export type RuntimeReplayResult = {
  queued: boolean;
  event?: RuntimeReplayEvent;
  reason?: string;
};

const runtimePersistenceClientId = `persistence-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const MAX_RUNTIME_SNAPSHOT_BYTES = 256_000;
let runtimePersistenceWriteCount = 0;
let runtimePersistenceSuppressedWriteCount = 0;
let runtimePersistenceRestoreCount = 0;

function nextVersion(): PersistenceVersion {
  const now = Date.now();
  return {
    version: now,
    updatedAtMs: now,
    clientId: runtimePersistenceClientId,
  };
}

export function restoreRuntimeJson<T>(scope: 'tenant' | 'system-admin', key: string, fallback: T) {
  const raw = readRuntimeItem(scope, key);
  runtimePersistenceRestoreCount += 1;
  if (!raw) {
    emitRuntimeEvent({
      type: 'persistence snapshot restored',
      channel: 'persistence',
      payload: { scope, key, restored: false, reason: 'missing_snapshot', runtimePersistenceRestoreCount },
    });
    return { restored: false, reason: 'missing_snapshot' } satisfies PersistenceHydrationResult<T>;
  }

  try {
    const value = JSON.parse(raw) as T;
    const snapshot = {
      scope,
      key,
      value,
      version: nextVersion(),
    } satisfies RuntimePersistenceSnapshot<T>;
    emitRuntimeEvent({
      type: 'persistence snapshot restored',
      channel: 'persistence',
      payload: { scope, key, restored: true, version: snapshot.version, snapshotBytes: raw.length, runtimePersistenceRestoreCount },
    });
    return { restored: true, snapshot } satisfies PersistenceHydrationResult<T>;
  } catch {
    emitRuntimeEvent({
      type: 'stale snapshot rejected',
      channel: 'persistence',
      payload: { scope, key, reason: 'invalid_json', snapshotBytes: raw.length, runtimePersistenceRestoreCount },
    });
    return {
      restored: false,
      snapshot: {
        scope,
        key,
        value: fallback,
        version: nextVersion(),
      },
      reason: 'invalid_json',
    } satisfies PersistenceHydrationResult<T>;
  }
}

export function persistRuntimeJson<T>(scope: 'tenant' | 'system-admin', key: string, value: T) {
  const nextSerialized = JSON.stringify(value);
  if (readRuntimeItem(scope, key) === nextSerialized) {
    runtimePersistenceSuppressedWriteCount += 1;
    emitRuntimeEvent({
      type: 'redundant persistence suppressed',
      channel: 'persistence',
      payload: { scope, key, runtimePersistenceSuppressedWriteCount },
    });
    return {
      scope,
      key,
      value,
      version: nextVersion(),
    } satisfies RuntimePersistenceSnapshot<T>;
  }
  const snapshot = {
    scope,
    key,
    value,
    version: nextVersion(),
  } satisfies RuntimePersistenceSnapshot<T>;
  writeRuntimeItem(scope, key, nextSerialized);
  runtimePersistenceWriteCount += 1;
  if (nextSerialized.length > MAX_RUNTIME_SNAPSHOT_BYTES) {
    console.warn('[pos-runtime:persistence] large runtime snapshot', {
      scope,
      key,
      snapshotBytes: nextSerialized.length,
      maxRuntimeSnapshotBytes: MAX_RUNTIME_SNAPSHOT_BYTES,
    });
  }
  emitRuntimeEvent({
    type: 'persistence snapshot written',
    channel: 'persistence',
    payload: { scope, key, version: snapshot.version, snapshotBytes: nextSerialized.length, runtimePersistenceWriteCount },
  });
  return snapshot;
}

export function restoreRecentAccountIds(key: string) {
  const result = restoreRuntimeJson<string[]>('tenant', key, []);
  return result.snapshot && Array.isArray(result.snapshot.value) ? result.snapshot.value : [];
}

export function persistRecentAccountIds(key: string, accountIds: string[]) {
  return persistRuntimeJson('tenant', key, accountIds);
}

export function persistTableLiveTotals(totals: Record<string, number>) {
  const before = JSON.stringify(getTableLiveTotals());
  setTableLiveTotals(totals);
  const after = JSON.stringify(getTableLiveTotals());
  if (before === after) {
    runtimePersistenceSuppressedWriteCount += 1;
    emitRuntimeEvent({
      type: 'redundant persistence suppressed',
      channel: 'persistence',
      payload: { key: 'aurelia-table-live-totals', tableIds: Object.keys(totals), runtimePersistenceSuppressedWriteCount },
    });
    return;
  }
  emitRuntimeEvent({
    type: 'persistence snapshot written',
    channel: 'persistence',
    payload: { key: 'aurelia-table-live-totals', tableIds: Object.keys(totals), runtimePersistenceWriteCount: ++runtimePersistenceWriteCount },
  });
}

export function persistTablePaymentRequested(tableId: string, requested: boolean) {
  setTablePaymentRequested(tableId, requested);
  emitRuntimeEvent({
    type: 'persistence snapshot written',
    channel: 'persistence',
    payload: { key: 'aurelia-table-payment-requested', tableId, requested, runtimePersistenceWriteCount: ++runtimePersistenceWriteCount },
  });
}

export function queueRuntimeReplay(event: Omit<RuntimeReplayEvent, 'id' | 'queuedAt'>) {
  const replayEvent: RuntimeReplayEvent = {
    id: `replay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString(),
    ...event,
  };
  emitRuntimeEvent({
    type: 'runtime replay queued',
    channel: 'persistence',
    payload: replayEvent,
  });
  return { queued: true, event: replayEvent } satisfies RuntimeReplayResult;
}

export function getRuntimePersistenceDiagnostics() {
  return {
    runtimePersistenceClientId,
    runtimePersistenceWriteCount,
    runtimePersistenceSuppressedWriteCount,
    runtimePersistenceRestoreCount,
    maxRuntimeSnapshotBytes: MAX_RUNTIME_SNAPSHOT_BYTES,
  };
}
