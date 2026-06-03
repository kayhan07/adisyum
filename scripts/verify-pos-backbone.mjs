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

const orderComposer = read('components/order-composer.tsx');
const floorWorkspace = read('components/floor-workspace.tsx');
const tableOrdersRoute = read('app/api/pos/table-orders/route.ts');
const runtimeState = read('lib/client/runtime-state.ts');
const tableLayoutStore = read('lib/table-layout-store.ts');
const localAgentRoute = read('app/api/printers/local-agent/route.ts');
const localAgentClient = read('lib/local-agent.ts');

const saveOrderIndex = orderComposer.indexOf("await persistOrderState('save_order')");
const printerDiscoveryIndex = orderComposer.indexOf('const ensureRuntimePrinters');
const paymentFinalizeIndex = orderComposer.indexOf("await mutateAuthoritativePayment('finalize_payment'");
const partialPaymentIndex = orderComposer.indexOf("await mutateAuthoritativePayment('add_partial_payment'");
const journalWriteIndex = orderComposer.indexOf('recordPaymentJournal(currentTable.name, paymentTargetTotal, paymentMutationId);', partialPaymentIndex);

assert(tableOrdersRoute.includes('await tx.order.upsert') && tableOrdersRoute.includes('await tx.orderItem.create'), 'POS API must keep the tenant-scoped product insertion path');
assert(saveOrderIndex > -1 && printerDiscoveryIndex > saveOrderIndex, 'Order save must complete before printer discovery');
assert(orderComposer.includes("await persistOrderState('mark_order_sent')"), 'Printed state must be persisted only after successful printing');
assert(tableOrdersRoute.includes("normalizedBody.action === 'close_table_payment'"), 'Payment must close through the authoritative table-orders API');
assert(tableOrdersRoute.includes("normalizedBody.action === 'add_partial_payment'"), 'Partial payment must use the authoritative table-orders API');
assert(tableOrdersRoute.includes("normalizedBody.action === 'get_payment_state'"), 'Payment modal must be able to reload authoritative payment state');
assert(tableOrdersRoute.includes('pg_advisory_xact_lock'), 'Payment mutation must serialize concurrent terminal writes');
assert(tableOrdersRoute.includes('duplicate payment mutation ignored'), 'Payment mutation must guard duplicate reconciliation keys');
assert(tableOrdersRoute.includes("type: 'pos_payment'"), 'Cash payment must persist a tenant-scoped cash transaction');
assert(tableOrdersRoute.includes('publishTenantOrderEventBestEffort'), 'Tenant order events must be non-blocking side effects');
assert(!tableOrdersRoute.includes("await publishTenantEvent(tenantId, 'orders'"), 'POS order save/payment must not await tenant event publishing');
assert(tableOrdersRoute.includes('authoritativeState: { ordersByTable'), 'POS responses must include authoritative order state for UI reconcile');
assert(paymentFinalizeIndex > -1 && partialPaymentIndex > -1 && journalWriteIndex > partialPaymentIndex, 'Local journal write must happen after authoritative payment mutation');
assert(orderComposer.includes('authoritativePaymentState.payments.map'), 'Payment modal must render authoritative payment history');
assert(/table\.total > 0\) return 'occupied'/.test(floorWorkspace), 'Floor table status must derive occupied state from authoritative open-order totals');
assert(!/subtotal \+ taxTotal/.test(tableOrdersRoute), 'POS API must not add VAT on top of VAT-included sale prices');
assert(!/\* \(1 \+ VAT_RATE\)/.test(floorWorkspace), 'Floor totals must not add VAT on top of VAT-included sale prices');
assert(/grossTotal - \(grossTotal \/ \(1 \+ VAT_RATE\)\)/.test(tableOrdersRoute), 'POS API must extract included VAT for reporting');
assert(tableOrdersRoute.includes('tenantProductIds'), 'Hydration must preserve current-tenant DB products while rejecting catalog residue');
assert(!/catalog\.items\.length === 0[\s\S]{0,120}return \{\}/.test(tableOrdersRoute), 'Catalog rebuild must not hide current-tenant open orders');
assert(/runtime snapshot rejected for tenant mismatch/.test(runtimeState), 'Runtime hydrate must reject tenant mismatch snapshots');
assert(/authRequired: authFailure/.test(runtimeState), 'Runtime persist auth failures must stop retry churn without corrupting saved orders');
assert(/shouldUseSeedBusinessData\(\) \? DEFAULT_TABLE_LAYOUT_STATE : EMPTY_TABLE_LAYOUT_STATE/.test(tableLayoutStore), 'New tenants must not receive default demo tables');
assert(localAgentRoute.includes('registered_printers_only'), 'Registered printers must remain visible while the local agent is missing');
assert(localAgentRoute.includes('agent_offline_registered_printers'), 'Registered printers must remain visible while the local agent is offline');
assert(localAgentClient.includes('tenant_session_required'), 'Super-admin printer endpoint rejection must surface a tenant-session-required diagnostic');

if (failures.length > 0) {
  console.error('[pos-backbone] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[pos-backbone] PASS');
