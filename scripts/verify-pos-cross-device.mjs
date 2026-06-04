import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const tableOrdersRoute = read('app/api/pos/table-orders/route.ts');
const tableStateRoute = read('app/api/runtime/table-state/route.ts');
const tablePaymentState = read('lib/table-payment-state.ts');
const tableLayoutStore = read('lib/table-layout-store.ts');

assert(tableOrdersRoute.includes('persistAuthoritativeRuntimeTableState'), 'POS payment/order mutation must persist server authoritative runtime table state');
assert(tableOrdersRoute.includes("source: transactionResult.closed ? 'payment-closed' : 'partial-payment'"), 'Payment response must distinguish closed and partial payment runtime state updates');
assert(tableOrdersRoute.includes('runtimeTableStateKey'), 'Payment response must expose the persisted runtime table-state key');
assert(tableOrdersRoute.includes('authoritativeState: {') || tableOrdersRoute.includes('authoritativeState: { ordersByTable'), 'POS mutations must return authoritativeState');
assert(tableOrdersRoute.includes('publishTenantOrderEventBestEffort'), 'Event publish must be best-effort and not block DB authoritative response');
assert(!tableOrdersRoute.includes("await publishTenantEvent(tenantId, 'orders'"), 'POS route must not await order event publishing');

assert(tableStateRoute.includes("`${TABLE_STATE_KEY}:${branchId || 'global'}`"), 'Runtime table-state key must be branch scoped');
assert(tableStateRoute.includes("url.searchParams.get('branchId')"), 'Runtime table-state GET must accept branchId');
assert(tableStateRoute.includes('tenant.branchId'), 'Runtime table-state must fall back to session branchId');
assert(tableStateRoute.includes('tenantId: tenant.tenantId'), 'Runtime table-state response must include tenantId');
assert(tableStateRoute.includes('branchId'), 'Runtime table-state response must include branchId');

assert(tablePaymentState.includes('refreshAuthoritativeOrdersByTable'), 'Client table state sync must hydrate authoritative DB orders');
assert(tablePaymentState.includes("runtimeFetch(`/api/runtime/table-state${query}`"), 'Client table state sync must hydrate branch-scoped runtime table-state');
assert(tablePaymentState.includes('applySnapshot(payload.state)'), 'Client table state sync must apply server table-state snapshots');
assert(tablePaymentState.includes('replaceAuthoritativeOrdersByTable(snapshot.ordersByTable)'), 'Client table state snapshot must update authoritative orders');
assert(tablePaymentState.includes('PRODUCT_RECOVERY_DISABLE_TABLE_RUNTIME_SERVER_PERSIST'), 'Client table runtime writes must not overwrite server authoritative POS orders');
assert(tableLayoutStore.includes("`${LOCAL_STORAGE_KEY}:${session.tenantId}:${branchId}`"), 'Table layout local cache must be tenant and branch scoped');

if (failures.length > 0) {
  console.error('[pos:cross-device] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[pos:cross-device] PASS');
