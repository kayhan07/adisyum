import {
  mergeAuthoritativeOrders,
  orderRevision,
  type PosMutationGuard,
  type PosOrderReconciliationSource,
  type PosReconciliationLine,
  type PosReconciliationDecision,
} from '@/lib/pos-order-reconciliation';

export type TableStateReconciliationLog = {
  source: PosOrderReconciliationSource;
  activeTableId: string | null;
  activeLineCount: number;
  activeRevision: number;
  pendingMutation: PosMutationGuard;
  decisions: PosReconciliationDecision[];
};

export function reconcileTableState<T extends PosReconciliationLine>(input: {
  current: Record<string, T[]>;
  incoming: Record<string, T[]>;
  activeTableId?: string | null;
  source: PosOrderReconciliationSource;
  pendingMutation?: PosMutationGuard;
  now?: number;
}) {
  const result = mergeAuthoritativeOrders({
    current: input.current,
    incoming: input.incoming,
    activeTableId: input.activeTableId,
    source: input.source,
    pendingMutation: input.pendingMutation,
    now: input.now ?? Date.now(),
  });
  const activeTableId = input.activeTableId ?? null;
  const activeLines = activeTableId ? result.orders[activeTableId] ?? [] : [];

  return {
    orders: result.orders,
    log: {
      source: input.source,
      activeTableId,
      activeLineCount: activeLines.length,
      activeRevision: orderRevision(activeLines),
      pendingMutation: input.pendingMutation ?? null,
      decisions: result.decisions,
    } satisfies TableStateReconciliationLog,
  };
}
