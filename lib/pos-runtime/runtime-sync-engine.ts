'use client';

import type { PendingMutation, RuntimeOrderLine } from '@/lib/pos-runtime/order-mutations';
import type { PosOrderReconciliationSource } from '@/lib/pos-order-reconciliation';
import { reconcileTableState, type TableStateReconciliationLog } from '@/lib/runtime/table-state-engine';
import { isRuntimeAuthRequired, POS_TABLE_ORDERS_API, runtimeFetch } from '@/lib/runtime/runtime-api';

export type RuntimeSyncMeta = {
  source: PosOrderReconciliationSource | 'persistence' | 'websocket';
  receivedAtMs: number;
  activeTableId?: string | null;
  pendingMutation?: PendingMutation | null;
  deferred?: boolean;
  reason?: string;
};

export type RuntimeSyncSnapshot<TLine extends RuntimeOrderLine = RuntimeOrderLine> = {
  ordersByTable: Record<string, TLine[]>;
  meta: RuntimeSyncMeta;
};

export type AuthoritativeTablePayload<TLine extends RuntimeOrderLine = RuntimeOrderLine> = {
  ordersByTable: Record<string, TLine[]>;
  source: 'db';
};

export type OptimisticProtectionResult = {
  protected: boolean;
  source: PosOrderReconciliationSource;
  ageMs?: number;
  pendingMutation?: PendingMutation | null;
  reason?: string;
};

export type SyncConflictResult = {
  accepted: boolean;
  source: PosOrderReconciliationSource;
  reason?: string;
  pendingMutation?: PendingMutation | null;
};

export type RuntimeHydrationResult<TLine extends RuntimeOrderLine = RuntimeOrderLine> = {
  applied: boolean;
  deferred: boolean;
  snapshot?: RuntimeSyncSnapshot<TLine>;
  reason?: string;
};

export type PersistenceSyncResult<TLine extends RuntimeOrderLine = RuntimeOrderLine> = {
  applied: boolean;
  snapshot?: RuntimeSyncSnapshot<TLine>;
  conflict?: SyncConflictResult;
};

export type RuntimeSyncDiagnostics = (event: string, payload: Record<string, unknown>) => void;

export type RuntimeReconciliationResult<TLine extends RuntimeOrderLine = RuntimeOrderLine> = {
  ordersByTable: Record<string, TLine[]>;
  log: TableStateReconciliationLog;
  conflict: SyncConflictResult;
};

const DEFAULT_PENDING_PROTECTION_MS = 2500;
let runtimeHydrationCount = 0;
let runtimeSyncCycleCount = 0;
let runtimeSubscriptionCount = 0;
let activeRuntimeSubscriptionCount = 0;
let runtimeSyncInFlightSuppressionCount = 0;

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export async function fetchAuthoritativeTablePayload<TLine extends RuntimeOrderLine>() {
  if (isRuntimeAuthRequired()) {
    throw new Error('AUTH_REQUIRED');
  }
  const response = await runtimeFetch(POS_TABLE_ORDERS_API, {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await readJsonResponse(response) as {
    ordersByTable?: Record<string, TLine[]>;
    message?: string;
    error?: string;
    traceId?: string;
  };
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('AUTH_REQUIRED');
    }
    throw new Error(`Authoritative order fetch failed with ${response.status}: ${payload.message ?? payload.error ?? 'unknown error'}${payload.traceId ? ` (${payload.traceId})` : ''}`);
  }
  return {
    ordersByTable: payload.ordersByTable ?? {},
    source: 'db',
  } satisfies AuthoritativeTablePayload<TLine>;
}

export function protectPendingOptimisticMutation(input: {
  source: PosOrderReconciliationSource;
  pendingMutation?: PendingMutation | null;
  now?: number;
  protectionMs?: number;
}) {
  const now = input.now ?? Date.now();
  const pendingMutation = input.pendingMutation ?? null;
  if (!pendingMutation) {
    return { protected: false, source: input.source, pendingMutation } satisfies OptimisticProtectionResult;
  }
  const ageMs = now - pendingMutation.at;
  const protectedMutation = ageMs < (input.protectionMs ?? DEFAULT_PENDING_PROTECTION_MS);
  return {
    protected: protectedMutation,
    source: input.source,
    ageMs,
    pendingMutation,
    reason: protectedMutation ? 'pending_optimistic_mutation' : undefined,
  } satisfies OptimisticProtectionResult;
}

export async function hydrateAuthoritativeRuntime<TLine extends RuntimeOrderLine>(input: {
  initialOrders: Record<string, TLine[]>;
  normalizeOrders: (orders: Record<string, TLine[]>) => Record<string, TLine[]>;
  getPendingMutation: () => PendingMutation | null;
  diagnostics?: RuntimeSyncDiagnostics;
}) {
  if (isRuntimeAuthRequired()) {
    input.diagnostics?.('runtime hydration stopped', {
      source: 'initial-hydration',
      reason: 'AUTH_REQUIRED',
    });
    return {
      applied: false,
      deferred: true,
      reason: 'AUTH_REQUIRED',
    } satisfies RuntimeHydrationResult<TLine>;
  }
  runtimeHydrationCount += 1;
  const hydrationStartedAtMs = Date.now();
  input.diagnostics?.('runtime hydration started', {
    source: 'initial-hydration',
    hydrationCount: runtimeHydrationCount,
  });
  const payload = await fetchAuthoritativeTablePayload<TLine>();
  input.diagnostics?.('authoritative payload received', {
    source: 'initial-hydration',
    tableCount: Object.keys(payload.ordersByTable).length,
    durationMs: Date.now() - hydrationStartedAtMs,
  });
  const protection = protectPendingOptimisticMutation({
    source: 'initial-hydration',
    pendingMutation: input.getPendingMutation(),
  });
  if (protection.protected) {
    input.diagnostics?.('optimistic mutation preserved', {
      source: 'initial-hydration',
      tableId: protection.pendingMutation?.tableId,
      mutationSource: protection.pendingMutation?.source,
      ageMs: protection.ageMs,
    });
    return {
      applied: false,
      deferred: true,
      reason: protection.reason,
    } satisfies RuntimeHydrationResult<TLine>;
  }

  const ordersByTable = input.normalizeOrders({
    ...input.initialOrders,
    ...payload.ordersByTable,
  });
  const snapshot = {
    ordersByTable,
    meta: {
      source: 'initial-hydration',
      receivedAtMs: Date.now(),
      pendingMutation: protection.pendingMutation,
    },
  } satisfies RuntimeSyncSnapshot<TLine>;
  input.diagnostics?.('runtime hydration completed', {
    hydrationCount: runtimeHydrationCount,
    durationMs: Date.now() - hydrationStartedAtMs,
    tableCount: Object.keys(ordersByTable).length,
    activeOrderTables: Object.entries(ordersByTable).filter(([, value]) => value.length > 0).map(([tableId]) => tableId),
  });
  return {
    applied: true,
    deferred: false,
    snapshot,
  } satisfies RuntimeHydrationResult<TLine>;
}

export function reconcileRuntimeSyncSnapshot<TLine extends RuntimeOrderLine>(input: {
  current: Record<string, TLine[]>;
  incoming: Record<string, TLine[]>;
  activeTableId?: string | null;
  source: PosOrderReconciliationSource;
  pendingMutation?: PendingMutation | null;
  diagnostics?: RuntimeSyncDiagnostics;
}) {
  const result = reconcileTableState({
    current: input.current,
    incoming: input.incoming,
    activeTableId: input.activeTableId,
    source: input.source,
    pendingMutation: input.pendingMutation,
  });
  const conflict = {
    accepted: true,
    source: input.source,
    pendingMutation: input.pendingMutation ?? null,
  } satisfies SyncConflictResult;
  input.diagnostics?.('authoritative sync applied', {
    source: input.source,
    activeTableId: input.activeTableId ?? null,
    activeLineCount: result.log.activeLineCount,
    activeRevision: result.log.activeRevision,
    decisions: result.log.decisions,
  });
  return {
    ordersByTable: result.orders,
    log: result.log,
    conflict,
  } satisfies RuntimeReconciliationResult<TLine>;
}

export function startAuthoritativeRuntimeSync<TLine extends RuntimeOrderLine>(input: {
  enabled: boolean;
  intervalMs?: number;
  initialOrders: Record<string, TLine[]>;
  normalizeOrders: (orders: Record<string, TLine[]>) => Record<string, TLine[]>;
  getPendingMutation: () => PendingMutation | null;
  getActiveTableId: () => string | null;
  onAuthoritativePayload: (payload: RuntimeSyncSnapshot<TLine>, source: 'interval' | 'focus') => void;
  onError: (source: 'interval' | 'focus', error: unknown) => void;
  diagnostics?: RuntimeSyncDiagnostics;
}) {
  if (!input.enabled || typeof window === 'undefined') return () => undefined;
  if (isRuntimeAuthRequired()) {
    input.diagnostics?.('runtime sync subscription stopped', {
      reason: 'AUTH_REQUIRED',
      activeRuntimeSubscriptionCount,
    });
    return () => undefined;
  }

  let cancelled = false;
  let reconcileInFlight = false;
  const reconcile = (source: 'interval' | 'focus') => {
    if (cancelled || isRuntimeAuthRequired()) {
      input.diagnostics?.('authoritative sync stopped', {
        source,
        reason: 'AUTH_REQUIRED',
      });
      return;
    }
    runtimeSyncCycleCount += 1;
    if (reconcileInFlight) {
      runtimeSyncInFlightSuppressionCount += 1;
      input.diagnostics?.('sync conflict resolved', {
        source,
        syncCycleCount: runtimeSyncCycleCount,
        runtimeSyncInFlightSuppressionCount,
        reason: 'reconcile_in_flight',
      });
      return;
    }
    const protection = protectPendingOptimisticMutation({
      source,
      pendingMutation: input.getPendingMutation(),
    });
    if (protection.protected) {
      input.diagnostics?.('stale payload rejected', {
        source,
        reason: protection.reason,
        tableId: protection.pendingMutation?.tableId,
        mutationSource: protection.pendingMutation?.source,
        ageMs: protection.ageMs,
      });
      return;
    }

    reconcileInFlight = true;
    const startedAtMs = Date.now();
    void fetchAuthoritativeTablePayload<TLine>()
      .then((payload) => {
        if (cancelled) return;
        input.diagnostics?.('authoritative payload received', {
          source,
          tableCount: Object.keys(payload.ordersByTable).length,
          durationMs: Date.now() - startedAtMs,
        });
        const ordersByTable = input.normalizeOrders({
          ...input.initialOrders,
          ...payload.ordersByTable,
        });
        input.onAuthoritativePayload({
          ordersByTable,
          meta: {
            source,
            receivedAtMs: Date.now(),
            activeTableId: input.getActiveTableId(),
            pendingMutation: protection.pendingMutation,
          },
        }, source);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
          input.diagnostics?.('authoritative sync stopped', {
            source,
            reason: 'AUTH_REQUIRED',
          });
          return;
        }
        input.diagnostics?.('authoritative sync failed', {
          source,
          durationMs: Date.now() - startedAtMs,
          error: error instanceof Error ? error.message : String(error),
        });
        input.onError(source, error);
      })
      .finally(() => {
        reconcileInFlight = false;
      });
  };

  runtimeSubscriptionCount += 1;
  activeRuntimeSubscriptionCount += 1;
  const timer = window.setInterval(() => reconcile('interval'), input.intervalMs ?? 3500);
  const handleFocus = () => reconcile('focus');
  window.addEventListener('focus', handleFocus);

  input.diagnostics?.('runtime sync subscription started', {
    intervalMs: input.intervalMs ?? 3500,
    runtimeSubscriptionCount,
    activeRuntimeSubscriptionCount,
  });

  return () => {
    cancelled = true;
    window.clearInterval(timer);
    window.removeEventListener('focus', handleFocus);
    activeRuntimeSubscriptionCount = Math.max(0, activeRuntimeSubscriptionCount - 1);
    input.diagnostics?.('runtime sync subscription stopped', {
      runtimeSubscriptionCount,
      activeRuntimeSubscriptionCount,
    });
  };
}

export function getRuntimeSyncDiagnostics() {
  return {
    runtimeHydrationCount,
    runtimeSyncCycleCount,
    runtimeSubscriptionCount,
    activeRuntimeSubscriptionCount,
    runtimeSyncInFlightSuppressionCount,
    defaultPendingProtectionMs: DEFAULT_PENDING_PROTECTION_MS,
  };
}
