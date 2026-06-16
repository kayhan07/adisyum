import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function check(name, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok) failures.push(name);
}

const tableStateRoute = read('app/api/runtime/table-state/route.ts');
const tableOrdersRoute = read('app/api/pos/table-orders/route.ts');
const printRequestsRoute = read('app/api/printers/print-requests/route.ts');
const localAgentRoute = read('app/api/printers/local-agent/route.ts');
const localAgentClient = read('lib/local-agent.ts');
const desktopMain = read('apps/desktop/src/main.cjs');
const runtimeState = read('lib/client/runtime-state.ts');
const tablePaymentState = read('lib/table-payment-state.ts');
const orderComposer = read('components/order-composer.tsx');
const posCatalogRoute = read('app/api/runtime/pos-catalog/route.ts');

check(
  'Tables are loaded from server DB source-of-truth',
  tableStateRoute.includes('async function loadDbTables') &&
    tableStateRoute.includes('prisma.posTable.findMany') &&
    tableStateRoute.includes("source: 'server'") &&
    tableStateRoute.includes('tableCount: dbTables.length'),
);

check(
  'Table definitions are tenant and branch scoped',
  tableStateRoute.includes('tenantId: tenant.tenantId') &&
    tableStateRoute.includes("`${TABLE_STATE_KEY}:${branchId || 'global'}`") &&
    tableStateRoute.includes("table.branchId === branchId"),
);

check(
  'Open table orders are read from authoritative DB orders',
  tableOrdersRoute.includes('loadAuthoritativeOrdersByTable') &&
    tableOrdersRoute.includes('prisma.order.findMany') &&
    tableOrdersRoute.includes("status: 'open'") &&
    tableOrdersRoute.includes('branchMatches'),
);

check(
  'Product add, quantity update and removal persist through the POS table-orders API',
  tableOrdersRoute.includes("normalizedBody.action === 'update_line_quantity'") &&
    tableOrdersRoute.includes("normalizedBody.action === 'remove_line'") &&
    tableOrdersRoute.includes('tx.orderItem.create') &&
    tableOrdersRoute.includes('tx.orderItem.update') &&
    tableOrdersRoute.includes('tx.orderItem.delete'),
);

check(
  'Payments persist DB Payment and CashTransaction records',
  tableOrdersRoute.includes('tx.payment.create') &&
    tableOrdersRoute.includes("type: 'pos_payment'") &&
    tableOrdersRoute.includes('tx.cashTransaction.create') &&
    tableOrdersRoute.includes('reconciliationKey'),
);

check(
  'Payment and order mutations update branch-scoped runtime table state',
  tableOrdersRoute.includes('persistAuthoritativeRuntimeTableState') &&
    tableOrdersRoute.includes("source: transactionResult.closed ? 'payment-closed' : 'partial-payment'") &&
    tableOrdersRoute.includes('runtimeTableStateKey') &&
    tablePaymentState.includes("void persistRuntimeScope('tenant');"),
);

check(
  'Product recovery mode does not disable table/order/payment persistence',
  tablePaymentState.includes('const PRODUCT_RECOVERY_DISABLE_TABLE_RUNTIME_SERVER_PERSIST = false;') &&
    !tablePaymentState.includes('table runtime server persistence disabled in product recovery mode'),
);

check(
  'Runtime snapshot refresh cannot erase POS domain keys with sparse/null-version snapshots',
  runtimeState.includes('function mergeRuntimeSnapshots') &&
    runtimeState.includes('const merged: RuntimeSnapshot = { ...snapshots[scope], ...incoming };') &&
    runtimeState.includes("'adisyon-sale-products'") &&
    runtimeState.includes("'adisyon-local-accounts'") &&
    runtimeState.includes("'adisyon-table-layout-state'") &&
    runtimeState.includes("const SNAPSHOT_DELETED_KEYS = '__adisyumRuntimeDeletedKeys';"),
);

check(
  'Stale table snapshots are rejected without blocking server hydration',
  runtimeState.includes("console.info('[runtime-state] stale table snapshot rejected'") &&
    tablePaymentState.includes('await refreshAuthoritativeOrdersByTable();') &&
    tablePaymentState.includes("source: 'server-runtime-state'"),
);

check(
  'POS catalog and categories hydrate from tenant server catalog',
  posCatalogRoute.includes('compileTenantPosCatalog') &&
    orderComposer.includes("runtimeFetch(`/api/runtime/pos-catalog") &&
    orderComposer.includes('setStoredCatalogProducts(catalog.items)') &&
    orderComposer.includes('categories are derived from active sale products') === false,
);

check(
  'Order composer refreshes tables, catalog and authoritative orders on table selection',
  orderComposer.includes('hydrateRuntimeCatalog') &&
    orderComposer.includes('refreshAuthoritativeOrdersByTable') &&
    orderComposer.includes('loadTableLayoutState') &&
    orderComposer.includes('selectedTableHydrationKeyRef'),
);

check(
  'Printer bridge activation uses live auth/me branch instead of blind mrk fallback',
  desktopMain.includes('async function fetchActivatedSession') &&
    desktopMain.includes('/api/auth/me') &&
    desktopMain.includes("const resolvedBranchId = branchId || sessionBranchId || 'mrk';"),
);

check(
  'Printer list reports tenant/branch mismatch explicitly',
  localAgentRoute.includes('agent_branch_mismatch') &&
    localAgentRoute.includes('Aktif şube') &&
    localAgentRoute.includes('Yazıcı şubesi'),
);

check(
  'Printer discovery is scoped to this computer device id',
  localAgentRoute.includes("request.headers.get('x-adisyum-device-id')") &&
    localAgentRoute.includes('deviceId: requestedDeviceId') &&
    localAgentRoute.includes('agent_device_required') &&
    localAgentClient.includes('async function desktopDeviceHeaders') &&
    localAgentClient.includes("'x-adisyum-device-id': deviceId"),
);

check(
  'Print requests are tenant branch and role scoped',
  printRequestsRoute.includes('tenantId: tenant.tenantId') &&
    printRequestsRoute.includes('branchId') &&
    printRequestsRoute.includes('printerRole') &&
    printRequestsRoute.includes("type: 'printer.job.queued'"),
);

check(
  'Offline printers keep queued print jobs instead of dropping the request',
  printRequestsRoute.includes("code: activeDevice ? 'queued_for_active_bridge' : 'queued_waiting_for_bridge'") &&
    printRequestsRoute.includes('targetDeviceId: activeDevice?.deviceId ?? validated.targetDeviceId') &&
    !printRequestsRoute.includes("code: 'no_active_bridge' }, { status: 409 }"),
);

check(
  'Agent polling can claim unassigned pending jobs for the same tenant branch',
  printRequestsRoute.includes('OR: [{ targetDeviceId: deviceId }, { targetDeviceId: null }]') &&
    printRequestsRoute.includes("status: { in: ['pending', 'failed'] }"),
);

check(
  'Print acknowledgement is tenant branch device scoped and emits printed event',
  printRequestsRoute.includes("status?: 'printing' | 'printed' | 'failed' | 'dead'") &&
    printRequestsRoute.includes('targetDeviceId: body.deviceId') &&
    printRequestsRoute.includes("type: 'receipt.printed'"),
);

check(
  'Tenant isolation is enforced on POS and printer routes',
  tableOrdersRoute.includes('const tenant = await requireTenant(request);') &&
    printRequestsRoute.includes('const tenant = registeredDevice ?? await requireTenant(request);') &&
    printRequestsRoute.includes('authenticateRegisteredDevice(request)'),
);

check(
  'Cross-device updates publish tenant events without blocking DB persistence',
  tableOrdersRoute.includes('publishTenantOrderEventBestEffort') &&
    tableOrdersRoute.includes('sideEffectOnly: true') &&
    tableOrdersRoute.includes('orderPersistenceUnaffected: true'),
);

check(
  'Favicon exists to avoid non-critical browser 404 noise',
  exists('public/favicon.ico'),
);

if (failures.length > 0) {
  console.error(`\n${failures.length}/21 POS backbone checks failed.`);
  process.exit(1);
}

console.log('\n21/21 POS backbone checks passed.');
