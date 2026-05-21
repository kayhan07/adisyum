'use client';

import { readRuntimeItem, writeRuntimeItem } from '@/lib/client/runtime-state';
import {
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
  if (!raw) {
    emitRuntimeEvent({
      type: 'persistence snapshot restored',
      channel: 'persistence',
      payload: { scope, key, restored: false, reason: 'missing_snapshot' },
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
      payload: { scope, key, restored: true, version: snapshot.version },
    });
    return { restored: true, snapshot } satisfies PersistenceHydrationResult<T>;
  } catch {
    emitRuntimeEvent({
      type: 'stale snapshot rejected',
      channel: 'persistence',
      payload: { scope, key, reason: 'invalid_json' },
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
  const snapshot = {
    scope,
    key,
    value,
    version: nextVersion(),
  } satisfies RuntimePersistenceSnapshot<T>;
  writeRuntimeItem(scope, key, JSON.stringify(value));
  emitRuntimeEvent({
    type: 'persistence snapshot written',
    channel: 'persistence',
    payload: { scope, key, version: snapshot.version },
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
  setTableLiveTotals(totals);
  emitRuntimeEvent({
    type: 'persistence snapshot written',
    channel: 'persistence',
    payload: { key: 'aurelia-table-live-totals', tableIds: Object.keys(totals) },
  });
}

export function persistTablePaymentRequested(tableId: string, requested: boolean) {
  setTablePaymentRequested(tableId, requested);
  emitRuntimeEvent({
    type: 'persistence snapshot written',
    channel: 'persistence',
    payload: { key: 'aurelia-table-payment-requested', tableId, requested },
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
