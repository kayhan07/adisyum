export type PosOrderReconciliationSource = 'initial-hydration' | 'focus' | 'interval' | 'mutation-result' | 'websocket' | 'manual-refresh';

export type PosReconciliationLine = {
  id: string;
  clientMutationId?: string;
  orderRevision?: number;
  updatedAtMs?: number;
  productId?: string;
  name: string;
  qty: number;
  note: string;
  price: number;
};

export type PosMutationGuard = {
  tableId: string;
  at: number;
  source: string;
} | null;

export type PosReconciliationDecision = {
  tableId: string;
  action: 'preserve-local-nonempty' | 'merge-authoritative-with-optimistic' | 'accept-authoritative';
  source: PosOrderReconciliationSource;
  localCount: number;
  incomingCount: number;
  mergedCount?: number;
  localRevision: number;
  incomingRevision: number;
  active?: boolean;
  pendingForTable?: boolean;
  localHasOptimistic?: boolean;
};

export const ACTIVE_TABLE_EMPTY_PAYLOAD_GRACE_MS = 15_000;
const EMPTY_LINES: PosReconciliationLine[] = [];

export function lineRevision(line: PosReconciliationLine) {
  return Math.max(Number(line.orderRevision ?? 0), Number(line.updatedAtMs ?? 0));
}

export function orderRevision(lines: PosReconciliationLine[]) {
  return lines.reduce((max, line) => Math.max(max, lineRevision(line)), 0);
}

export function hasPendingOptimisticLines(lines: PosReconciliationLine[]) {
  return lines.some((line) => line.id.startsWith('optimistic-'));
}

export function mergeOptimisticLines<T extends PosReconciliationLine>(localLines: T[], authoritativeLines: T[]) {
  const authoritativeMutationIds = new Set(
    authoritativeLines
      .map((line) => line.clientMutationId)
      .filter((value): value is string => Boolean(value)),
  );
  const authoritativeProductKeys = new Set(
    authoritativeLines.map((line) => `${line.productId ?? ''}:${line.name}:${line.note}:${line.price}:${line.qty}`),
  );
  const survivingOptimisticLines = localLines.filter((line) => {
    if (!line.id.startsWith('optimistic-')) return false;
    if (line.clientMutationId && authoritativeMutationIds.has(line.clientMutationId)) return false;
    const productKey = `${line.productId ?? ''}:${line.name}:${line.note}:${line.price}:${line.qty}`;
    return !authoritativeProductKeys.has(productKey);
  });

  return [...authoritativeLines, ...survivingOptimisticLines];
}

export function mergeAuthoritativeOrders<T extends PosReconciliationLine>(input: {
  current: Record<string, T[]>;
  incoming: Record<string, T[]>;
  activeTableId?: string | null;
  source: PosOrderReconciliationSource;
  pendingMutation?: PosMutationGuard;
  now: number;
}) {
  const next: Record<string, T[]> = { ...input.current };
  const tableIds = new Set([...Object.keys(input.current), ...Object.keys(input.incoming)]);
  const decisions: PosReconciliationDecision[] = [];

  tableIds.forEach((tableId) => {
    const localLines = input.current[tableId] ?? EMPTY_LINES as T[];
    const incomingLines = input.incoming[tableId] ?? EMPTY_LINES as T[];
    const localCount = localLines.length;
    const incomingCount = incomingLines.length;
    const localRevision = orderRevision(localLines);
    const incomingRevision = orderRevision(incomingLines);
    const active = tableId === input.activeTableId;
    const pendingForTable = input.pendingMutation?.tableId === tableId && input.now - input.pendingMutation.at < ACTIVE_TABLE_EMPTY_PAYLOAD_GRACE_MS;
    const localHasOptimistic = hasPendingOptimisticLines(localLines);

    if (incomingCount === 0 && localCount > 0 && (active || pendingForTable || localHasOptimistic)) {
      next[tableId] = localLines;
      decisions.push({
        tableId,
        action: 'preserve-local-nonempty',
        source: input.source,
        localCount,
        incomingCount,
        localRevision,
        incomingRevision,
        active,
        pendingForTable,
        localHasOptimistic,
      });
      return;
    }

    if (incomingCount > 0 && localHasOptimistic) {
      next[tableId] = mergeOptimisticLines(localLines, incomingLines);
      decisions.push({
        tableId,
        action: 'merge-authoritative-with-optimistic',
        source: input.source,
        localCount,
        incomingCount,
        mergedCount: next[tableId]?.length ?? 0,
        localRevision,
        incomingRevision,
      });
      return;
    }

    if (incomingCount > 0 || localCount === 0 || !active) {
      next[tableId] = incomingLines;
      decisions.push({
        tableId,
        action: 'accept-authoritative',
        source: input.source,
        localCount,
        incomingCount,
        localRevision,
        incomingRevision,
      });
    }
  });

  return { orders: next, decisions };
}
