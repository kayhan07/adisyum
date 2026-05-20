import assert from 'node:assert/strict';
import { mergeAuthoritativeOrders, type PosReconciliationLine } from '../lib/pos-order-reconciliation';

function line(id: string, overrides: Partial<PosReconciliationLine> = {}): PosReconciliationLine {
  return {
    id,
    productId: 'prod-1',
    name: 'Latte',
    qty: 1,
    note: '',
    price: 100,
    updatedAtMs: 1000,
    orderRevision: 1000,
    ...overrides,
  };
}

{
  const result = mergeAuthoritativeOrders({
    current: { table1: [line('local-1')] },
    incoming: { table1: [] },
    activeTableId: 'table1',
    source: 'interval',
    pendingMutation: null,
    now: 10_000,
  });

  assert.equal(result.orders.table1.length, 1);
  assert.equal(result.decisions[0]?.action, 'preserve-local-nonempty');
}

{
  const result = mergeAuthoritativeOrders({
    current: { table1: [line('optimistic-mut-1', { clientMutationId: 'mut-1' })] },
    incoming: { table1: [line('server-1', { clientMutationId: 'mut-1' })] },
    activeTableId: 'table1',
    source: 'mutation-result',
    pendingMutation: { tableId: 'table1', at: 9500, source: 'product-grid' },
    now: 10_000,
  });

  assert.equal(result.orders.table1.length, 1);
  assert.equal(result.orders.table1[0]?.id, 'server-1');
  assert.equal(result.decisions[0]?.action, 'merge-authoritative-with-optimistic');
}

{
  const result = mergeAuthoritativeOrders({
    current: { table1: [line('old-closed')] },
    incoming: { table1: [] },
    activeTableId: 'table2',
    source: 'manual-refresh',
    pendingMutation: null,
    now: 10_000,
  });

  assert.equal(result.orders.table1.length, 0);
  assert.equal(result.decisions[0]?.action, 'accept-authoritative');
}

{
  const result = mergeAuthoritativeOrders({
    current: { table1: [line('optimistic-mut-2', { clientMutationId: 'mut-2', productId: 'prod-2', name: 'Tea' })] },
    incoming: { table1: [line('server-2', { clientMutationId: 'mut-1' })] },
    activeTableId: 'table1',
    source: 'focus',
    pendingMutation: { tableId: 'table1', at: 9500, source: 'search' },
    now: 10_000,
  });

  assert.equal(result.orders.table1.length, 2);
  assert.equal(result.decisions[0]?.action, 'merge-authoritative-with-optimistic');
}

console.log('pos order reconciliation valid');
