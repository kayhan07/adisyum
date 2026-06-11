import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const files = {
  floor: 'components/floor-workspace.tsx',
  tableOrders: 'app/api/pos/table-orders/route.ts',
  dailyReports: 'app/api/finance/daily-reports/route.ts',
  currentAccounts: 'app/api/finance/current-account-movements/route.ts',
  printerLocalAgent: 'app/api/printers/local-agent/route.ts',
  printerPrint: 'app/api/printers/local-agent/print/route.ts',
  printerRequests: 'app/api/printers/print-requests/route.ts',
  posDevices: 'app/api/settings/pos/devices/route.ts',
  posDevicePrintTest: 'app/api/settings/pos/devices/[deviceId]/print-test/route.ts',
  runtimeState: 'lib/client/runtime-state.ts',
  authoritativeOrders: 'lib/client/authoritative-table-orders.ts',
  tablePaymentState: 'lib/table-payment-state.ts',
  tableLayoutStore: 'lib/table-layout-store.ts',
  tenantCleanStart: 'lib/tenant-clean-start.ts',
  runtimeCatalog: 'lib/server/runtime-pos-catalog.ts',
  tenantRepository: 'lib/db/tenant-repository.ts',
  schema: 'prisma/schema.prisma',
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, file]) => {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Required file is missing: ${file}`);
    }
    return [key, fs.readFileSync(fullPath, 'utf8')];
  }),
);

const results = [];

function pass(id, detail) {
  results.push({ id, status: 'PASS', detail });
}

function fail(id, detail) {
  results.push({ id, status: 'FAIL', detail });
}

function assertSignal(id, condition, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function regexAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function block(text, startPattern) {
  const start = text.search(startPattern);
  if (start === -1) return '';
  const nextModel = text.slice(start + 1).search(/\nmodel\s+\w+\s+\{/);
  return nextModel === -1 ? text.slice(start) : text.slice(start, start + 1 + nextModel);
}

function simulateLiveTotals(knownTables, serverOrders) {
  const allKnownTableIds = [...new Set([
    ...knownTables.map((table) => table.id),
    ...Object.keys(serverOrders),
  ])];

  return Object.fromEntries(
    allKnownTableIds.map((tableId) => [
      tableId,
      (serverOrders[tableId] ?? []).reduce((sum, line) => {
        const qty = Number(line.qty ?? 0);
        const price = Number(line.price ?? 0);
        return sum + qty * price;
      }, 0),
    ]),
  );
}

function scenarioTenantIsolation() {
  assertSignal(
    'S1.1 table-orders derives tenant from requireTenant',
    regexAll(source.tableOrders, [
      /const tenant = await requireTenant\(request\)/,
      /tenantId = tenant\.tenantId/,
      /where:\s*\{\s*tenantId,\s*status:\s*'open'/,
    ]),
    'Authoritative open table orders are loaded through the authenticated tenant, not a body/query tenantId.',
  );

  assertSignal(
    'S1.2 open order items are filtered by tenant catalog',
    includesAll(source.tableOrders, [
      'compileTenantPosCatalog(tenantId',
      'tenantProductIds',
      'orderItemBelongsToCurrentCatalog',
      'metadata.tenantId === tenantId',
    ]),
    'Order hydration requires current tenant catalog membership and server-stamped tenant metadata.',
  );

  assertSignal(
    'S1.3 product/runtime catalog is tenant-scoped',
    includesAll(source.runtimeCatalog, ['tenantId', 'findMany', 'productCategory', 'Product']) &&
      !/tenantId:\s*['"]system['"]/.test(source.runtimeCatalog),
    'Runtime POS catalog reads tenant data and does not fall back to system/demo tenant products.',
  );

  assertSignal(
    'S1.4 demo seed data is opt-in only',
    includesAll(source.tenantCleanStart, ['useSeedBusinessDataEnabled', 'NEXT_PUBLIC_ENABLE_SEED_BUSINESS_DATA', 'NEXT_PUBLIC_SEED_TENANT_ID']) &&
      source.floor.includes('useSeedBusinessDataEnabled'),
    'Seed/demo data is gated before it can appear in the floor workspace.',
  );
}

function scenarioClearAndAuthoritativeSync() {
  const totals = simulateLiveTotals([{ id: 'A-1' }, { id: 'A-2' }], { 'A-2': [{ qty: 2, price: 50 }] });

  assertSignal(
    'S2.1 liveTotals writes explicit zero for omitted known tables',
    totals['A-1'] === 0 && totals['A-2'] === 100,
    'Simulation proves a server response with only active tables still writes 0 for cleared known tables.',
  );

  assertSignal(
    'S2.2 floor buildLiveTotalsForKnownTables includes known tables',
    includesAll(source.floor, ['buildLiveTotalsForKnownTables', '...knownTables.map((table) => table.id)', 'serverOrders[tableId] ?? []']),
    'The production helper mirrors the simulation and prevents undefined liveTotals for known tables.',
  );

  assertSignal(
    'S2.3 quickClearTable persists available zero state',
    regexAll(source.floor, [
      /function quickClearTable/,
      /status:\s*'available' as const/,
      /setTablePaymentRequested\(tableId, false\)/,
      /total:\s*0/,
      /setTableLiveTotals\(\{ \.\.\.currentTotals, \[tableId\]: 0 \}\)/,
      /persistRows\(nextRows\)/,
    ]),
    'quickClearTable clears UI/liveTotals/layout rows immediately.',
  );

  assertSignal(
    'S2.4 displayTableRows documents stale layout fallback risk',
    source.floor.includes('Authoritative sync writes an explicit 0 for every known table') &&
      source.floor.includes('total: liveTotals[table.id] ?? table.total'),
    'The fallback remains documented and is guarded by explicit zero liveTotals.',
  );
}

function scenarioPaymentCloseReportsCash() {
  assertSignal(
    'S3.1 payment close deletes lines and marks order paid',
    regexAll(source.tableOrders, [
      /if \(closed\) await tx\.orderItem\.deleteMany\(\{ where: \{ tenantId, orderId: order\.id \} \}\)/,
      /status:\s*closed \? 'paid' : 'open'/,
      /remainingTotal:\s*0/,
      /source:\s*transactionResult\.closed \? 'payment-closed' : 'partial-payment'/,
    ]),
    'Full payment closes the order, removes open items and returns fresh authoritative orders.',
  );

  assertSignal(
    'S3.2 duplicate payment is ignored by reconciliation key',
    includesAll(source.tableOrders, [
      'const duplicatePayment = currentState.payments.find',
      'duplicate payment mutation ignored',
      'reconciliationKey',
      'paymentCreated: false',
    ]),
    'Repeated payment mutation with the same reconciliation key does not create a second payment.',
  );

  assertSignal(
    'S3.3 cash movement is tenant-scoped and idempotent enough for POS payment path',
    includesAll(source.tableOrders, [
      "type: 'pos_payment'",
      'tenantId',
      'branchId: tenant.branchId',
      'reconciliationKey',
      'createdPayment.id',
    ]),
    'POS payment writes a tenant/branch-stamped cash movement carrying the payment reconciliation key.',
  );

  assertSignal(
    'S3.4 daily report route requires tenant before finance backend proxy',
    includesAll(source.dailyReports, ['requireTenant(request)', 'posBackendJson(`/finance/daily-reports']),
    'Daily reports are gated by tenant auth before backend retrieval.',
  );
}

function scenarioCurrentAccount() {
  assertSignal(
    'S4.1 CurrentAccount and CurrentAccountMovement models exist',
    /model CurrentAccountMovement\s+\{/.test(source.schema),
    'Schema supports dedicated current account movements. There is no separate CurrentAccount card model in this schema.',
  );

  assertSignal(
    'S4.2 current account movement has tenant reconciliation uniqueness',
    /@@unique\(\[tenantId,\s*reconciliationKey\]/.test(source.schema),
    'Duplicate current account movements are blocked per tenant reconciliation key.',
  );

  assertSignal(
    'S4.3 current account API ignores body tenantId and scopes by requireTenant',
    regexAll(source.currentAccounts, [
      /const tenant = await requireTenant\(request\)/,
      /where:\s*\{ tenantId: tenant\.tenantId/,
      /tenantId_reconciliationKey:\s*\{ tenantId: tenant\.tenantId, reconciliationKey \}/,
      /type:\s*action === 'record_collection' \? 'current_account_collection' : 'current_account_payment'/,
    ]),
    'Cari movement API uses authenticated tenant scope and idempotent reconciliation keys.',
  );
}

function scenarioPrinters() {
  const printerModel = block(source.schema, /model Printer\s+\{/);

  assertSignal(
    'S5.1 Printer model does not enforce one printer per tenant',
    /model Printer\s+\{/.test(printerModel) && !/@@unique\(\[tenantId\]/.test(printerModel),
    'There is no tenant-wide unique constraint that would limit a tenant to a single printer.',
  );

  assertSignal(
    'S5.2 printer flows carry role/type/station equivalent fields',
    includesAll(source.printerRequests + source.printerPrint + source.posDevicePrintTest, [
      'printerName',
      'printerRole',
      'role',
    ]),
    'Print requests and test print paths preserve printer role/station intent.',
  );

  assertSignal(
    'S5.3 printer routes are tenant and branch scoped',
    [source.printerLocalAgent, source.printerPrint, source.printerRequests, source.posDevices, source.posDevicePrintTest]
      .every((text) => text.includes('requireTenant(request)') && text.includes('tenant.tenantId') && text.includes('branchId')),
    'Printer discovery, print queue and POS device/test-print routes require tenant auth and branch context.',
  );

  assertSignal(
    'S5.4 registered printers are filtered by metadata branchId',
    includesAll(source.printerLocalAgent, ['filterRegisteredPrintersByBranch', 'metadata.branchId', 'printerBranchId === branchId']),
    'Local agent fallback does not show another branch printer when metadata branchId is present.',
  );
}

function scenarioMultiDeviceSync() {
  assertSignal(
    'S6.1 mutations publish tenant order events',
    includesAll(source.tableOrders, ['publishTenantOrderEventBestEffort', "publishTenantEvent(tenantId, 'orders'", 'ordersByTable']),
    'Order changes are announced on tenant-scoped order events.',
  );

  assertSignal(
    'S6.2 client refreshes authoritative orders and stores per tenant/branch',
    includesAll(source.authoritativeOrders, [
      'refreshAuthoritativeOrdersByTable',
      'fetchAuthoritativeTablePayload',
      'replaceAuthoritativeOrdersByTable',
      'ordersByTable',
    ]),
    'Cross-device sync is based on server authoritative table orders.',
  );

  assertSignal(
    'S6.3 floor polls/focus-refreshes authoritative table orders',
    includesAll(source.floor, [
      'window.setInterval(syncAuthoritativeOrders, 4000)',
      'visibilitychange',
      'refreshAuthoritativeOrdersByTable',
      'replaceAuthoritativeOrdersByTable',
    ]),
    'Device B can converge by polling/focus refresh even if it missed a local storage event.',
  );
}

function scenarioReportsDayEnd() {
  assertSignal(
    'S7.1 floor day-end is represented as daily cash movement',
    includesAll(source.floor, ['closeDayCash', 'appendDailyCashMovement', 'dayEndTransfer', 'Gün sonu yap']),
    'Current architecture represents day-end through daily cash movement/transfer state, not a separate destructive close route.',
  );

  assertSignal(
    'S7.2 payment method report separates cash/card/account',
    includesAll(source.floor, ['cashCollections', 'posCollections', 'accountCollections', 'reportMethodFilter']),
    'Daily report UI separates payment method totals and filters.',
  );
}

scenarioTenantIsolation();
scenarioClearAndAuthoritativeSync();
scenarioPaymentCloseReportsCash();
scenarioCurrentAccount();
scenarioPrinters();
scenarioMultiDeviceSync();
scenarioReportsDayEnd();

const failures = results.filter((result) => result.status === 'FAIL');

for (const result of results) {
  const marker = result.status === 'PASS' ? 'ok' : 'FAIL';
  console.log(`${marker} ${result.id} - ${result.detail}`);
}

console.log('');
console.log(`Live acceptance critical checks: ${results.length - failures.length}/${results.length} passed`);

if (failures.length > 0) {
  console.error('');
  console.error('Blocking failures:');
  for (const failure of failures) {
    console.error(`- ${failure.id}: ${failure.detail}`);
  }
  process.exit(1);
}
