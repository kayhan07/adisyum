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
const localAgentRoute = read('app/api/printers/local-agent/route.ts');
const localAgentClient = read('lib/local-agent.ts');
const runtimeState = read('lib/client/runtime-state.ts');

const saveRequestIndex = orderComposer.indexOf("action: 'save_order'");
const printerDiscoveryIndex = orderComposer.indexOf('const ensureRuntimePrinters');

assert(saveRequestIndex > -1, 'Order composer must persist save_order before printing');
assert(printerDiscoveryIndex > -1 && saveRequestIndex < printerDiscoveryIndex, 'Order persistence must run before printer discovery');
assert(orderComposer.includes('Adisyon kaydedildi. Yazıcı bulunamadı'), 'Missing printer feedback must confirm the order remains saved');
assert(tableOrdersRoute.includes("normalizedBody.action === 'save_order'"), 'Table-orders API must expose the save_order mutation');
assert(tableOrdersRoute.includes("normalizedBody.action === 'mark_order_sent'"), 'Table-orders API must separate saved orders from printed orders');
assert(orderComposer.includes("await persistOrderState('mark_order_sent')"), 'Order composer must mark items sent only after successful printing');
assert(tableOrdersRoute.includes("'order.saved'"), 'Table-orders API must publish the saved order event');
assert(tableOrdersRoute.includes('publishTenantOrderEventBestEffort'), 'Order event publishing must be best-effort side effect work');
assert(!tableOrdersRoute.includes("await publishTenantEvent(tenantId, 'orders'"), 'Order mutations must not wait for tenant event publishing');
assert(tableOrdersRoute.includes('orderPersistenceUnaffected: true'), 'Event publish failure logs must state that order persistence is unaffected');
assert(tableOrdersRoute.includes('authoritativeState: { ordersByTable'), 'Successful POS mutations must return authoritative state for UI reconcile');
assert(tableOrdersRoute.includes('tenantProductIds'), 'Open-order hydration must preserve active products linked to the current tenant');
assert(!/catalog\.items\.length === 0[\s\S]{0,120}return \{\}/.test(tableOrdersRoute), 'Open-order hydration must not disappear while the runtime catalog is rebuilding');
assert(tableOrdersRoute.includes("normalizedBody.action === 'close_table_payment'"), 'Payment must close through the authoritative table-orders API');
assert(tableOrdersRoute.includes("'order_not_found_for_payment'"), 'Payment close must fail safely when the table order is missing');
assert(tableOrdersRoute.includes('persistAuthoritativeRuntimeTableState'), 'Payment close must persist authoritative runtime table state');
assert(tableOrdersRoute.includes("status: closed ? 'paid' : 'open'"), 'Payment close must mark the order paid/closed on the server');
assert(tableOrdersRoute.includes('if (closed) await tx.orderItem.deleteMany'), 'Payment close must remove active order lines from the authoritative table');
assert(tableOrdersRoute.includes("type: 'pos_payment'"), 'Cash/card payment must create a tenant-scoped cash transaction');
assert(tableOrdersRoute.includes("type: 'SALE_DEBT'"), 'Account payment must create a tenant-scoped current account movement');
assert(tableOrdersRoute.includes('branchId: tenant.branchId'), 'Payment ledgers and runtime state must carry branch scope');
assert(tableOrdersRoute.includes('runtimeTableStateKey'), 'Payment response must include the persisted runtime table-state key');
assert(tableOrdersRoute.includes('duplicate payment mutation ignored'), 'Payment close must guard duplicate reconciliation keys');
assert(tableOrdersRoute.includes('paymentCreated: transactionResult.paymentCreated'), 'Payment response must expose whether a payment was actually created');
assert(tableOrdersRoute.includes('ordersByTable = await loadAuthoritativeOrdersByTable'), 'Payment response must reload authoritative orders from DB after mutation');
assert(/table\.total > 0\) return 'occupied'/.test(floorWorkspace), 'Floor status must mark a table occupied when the authoritative total is positive');
assert(localAgentRoute.includes('registered_printers_only'), 'Local-agent proxy must expose registered printers when the agent is missing');
assert(localAgentRoute.includes('agent_offline_registered_printers'), 'Local-agent proxy must expose registered printers when the agent is offline');
assert(localAgentRoute.includes('prisma.printer.findMany'), 'Local-agent proxy must load tenant-scoped registered printer mappings');
assert(localAgentClient.includes('tenant_session_required'), 'Local-agent client must surface tenant-session-required printer diagnostics');
assert(runtimeState.includes('authRequired: authFailure'), 'Runtime state persist must mark auth failures and stop retry churn');
assert(runtimeState.includes('pendingFlushes.delete(scope)'), 'Runtime state auth failure must clear pending persist flushes');

if (failures.length > 0) {
  console.error('POS critical flow validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('POS critical flow validation passed.');
