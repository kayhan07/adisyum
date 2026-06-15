import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(path, 'utf8');
}

const checks = [];
function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

const tableOrders = read('app/api/pos/table-orders/route.ts');
const orderComposer = read('components/order-composer.tsx');
const floorWorkspace = read('components/floor-workspace.tsx');
const printRequests = read('app/api/printers/print-requests/route.ts');

check('table order API requires tenant session', tableOrders.includes('requireTenant(request)'));
check('order item add publishes tenant event', tableOrders.includes("type: 'order.item_added'"));
check('order item update publishes tenant event', tableOrders.includes("type: normalizedBody.action === 'remove_line' ? 'order.item_deleted' : 'order.item_updated'"));
check('order mutation also publishes order.updated', tableOrders.includes("type: 'order.updated'"));
check('payment creation publishes payment.created', tableOrders.includes("type: 'payment.created'") && tableOrders.includes("'payments'"));
check('payment/table closure publishes table.updated', tableOrders.includes("type: 'table.updated'"));
check('print ack publishes receipt.printed', printRequests.includes("type: 'receipt.printed'"));
check('order composer refreshes authoritative orders every 4 seconds', orderComposer.includes('setInterval(() => syncAuthoritativeOrders') && orderComposer.includes('4000'));
check('order composer refreshes on focus/visibility', orderComposer.includes("window.addEventListener('focus', handleFocus)") && orderComposer.includes('visibilitychange'));
check('floor workspace syncs authoritative orders by table', floorWorkspace.includes('refreshAuthoritativeOrdersByTable') && floorWorkspace.includes('syncAuthoritativeOrders'));
check('local table totals are overwritten by authoritative server totals', floorWorkspace.includes('setLiveTotals(buildLiveTotalsForKnownTables') && floorWorkspace.includes('buildLiveTotalsForKnownTables(knownTables'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} table order realtime checks failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} table order realtime checks passed.`);
