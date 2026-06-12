#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.join(root, 'reports', 'restaurant-real-usage-flow-audit.json');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const files = {
  orderComposer: 'components/order-composer.tsx',
  floorWorkspace: 'components/floor-workspace.tsx',
  tableOrdersRoute: 'app/api/pos/table-orders/route.ts',
  runtimeTableStateRoute: 'app/api/runtime/table-state/route.ts',
  runtimePosCatalogRoute: 'app/api/runtime/pos-catalog/route.ts',
  printerRequestsRoute: 'app/api/printers/print-requests/route.ts',
  printerLocalAgentRoute: 'app/api/printers/local-agent/route.ts',
  printerLocalAgentPrintRoute: 'app/api/printers/local-agent/print/route.ts',
  deviceRegistryRoute: 'app/api/devices/registry/route.ts',
  productsPage: 'app/products/page.tsx',
  productDomain: 'lib/product-domain.ts',
  productCatalog: 'lib/sale-product-catalog.ts',
  recipeEngine: 'lib/smart-recipe-stock-engine.ts',
  currentAccountRoute: 'app/api/finance/current-account-movements/route.ts',
  livePosScript: 'scripts/verify-live-pos-business-flow.mjs',
  mobileUiScript: 'scripts/verify-mobile-pos-ui.mjs',
  printerTenantScopeScript: 'scripts/verify-printer-tenant-scope.mjs',
  schema: 'prisma/schema.prisma',
};

const source = {};
for (const [key, relativePath] of Object.entries(files)) {
  source[key] = exists(relativePath) ? read(relativePath) : '';
}

const checks = [];

function check(id, ok, evidence, severity = 'high') {
  checks.push({ id, ok: Boolean(ok), severity, evidence });
}

function includesAll(text, tokens) {
  return tokens.every((token) => text.includes(token));
}

function regexAll(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

check(
  'table-payment-persists-authoritative-state',
  includesAll(source.tableOrdersRoute, [
    'persistAuthoritativeRuntimeTableState',
    "source: transactionResult.closed ? 'payment-closed' : 'partial-payment'",
    'runtimeTableStateKey',
    'tenantId',
  ]),
  'Payment mutations must persist authoritative branch table-state and expose the persisted key.',
);

check(
  'payment-closes-table-locally-and-live-total-zero',
  includesAll(source.orderComposer, [
    'replaceAuthoritativeOrdersByTable({ ...ordersByTable, [currentTableId]: [] })',
    'persistTableLiveTotals({ [currentTableId]: 0 })',
    'setPaymentOpen(false)',
    'updatePaymentRequested(currentTableId, false)',
  ]),
  'Full payment clears client order state, live totals, payment request state, and closes the panel.',
);

check(
  'cross-device-authoritative-sync',
  includesAll(source.orderComposer + source.floorWorkspace, [
    'refreshAuthoritativeOrdersByTable',
    'syncAuthoritativeOrders',
    'replaceAuthoritativeOrdersByTable',
    'setLiveTotals',
  ]),
  'Floor/order UI hydrates authoritative orders and live totals for cross-device refresh.',
);

check(
  'table-move-clears-source-and-preserves-target',
  regexAll(source.orderComposer, [
    /const moveCurrentTable\s*=\s*\(\)\s*=>/,
    /\[currentTable\.id\]: \[\]/,
    /\[moveTargetId\]: sourceOrders/,
    /updatePaymentRequested\(currentTable\.id, false\)/,
    /setSelectedTableId\(moveTargetId\)/,
  ]),
  'Move flow must empty the source table, transfer source lines, clear payment request state, and focus target table.',
);

check(
  'table-merge-clears-source-and-preserves-target-total',
  regexAll(source.orderComposer, [
    /const mergeCurrentTable\s*=\s*\(\)\s*=>/,
    /const mergedOrders = \[/,
    /\[currentTable\.id\]: remainingOrders/,
    /\[mergeTargetId\]: mergedOrders/,
    /updatePaymentRequested\(currentTable\.id, false\)/,
    /setSelectedTableId\(mergeTargetId\)/,
  ]),
  'Merge flow must move selected source lines into target and leave source with only remaining lines.',
);

check(
  'tenant-scoped-pos-order-route',
  includesAll(source.tableOrdersRoute, [
    'requireTenant',
    'tenantAuthErrorResponse',
    'tenantId',
    'branchId',
    'where: { tenantId_orderNo: { tenantId, orderNo } }',
    'where: { tenantId, orderId: order.id, status: \'paid\' }',
  ]),
  'POS order route must derive tenant from session and scope order/payment lookups.',
);

check(
  'payment-to-cash-transaction-chain',
  includesAll(source.tableOrdersRoute, [
    'tx.payment.create',
    'tx.cashTransaction.create',
    "type: 'pos_payment'",
    'paymentId: createdPayment.id',
    'reconciliationKey',
  ]),
  'Cash payments must create one linked CashTransaction with reconciliation metadata.',
);

check(
  'current-account-payment-chain',
  includesAll(source.tableOrdersRoute + source.currentAccountRoute, [
    'currentAccountMovement.create',
    'accountAmount',
    'paymentId: createdPayment.id',
    'current_account_collection',
  ]),
  'Account payments must create current-account movement and finance side effects.',
  'medium',
);

check(
  'daily-report-db-proof-uses-cash-transactions',
  includesAll(source.livePosScript, [
    'prisma.cashTransaction.findMany',
    "row?.type === 'pos_payment'",
    "timeZone: 'Europe/Istanbul'",
    'duplicateByReconciliationKey',
  ]),
  'Live verifier proves daily finance totals from CashTransaction rows in Europe/Istanbul day.',
);

check(
  'sellable-products-only-in-pos-catalog',
  includesAll(source.productDomain + source.runtimePosCatalogRoute, [
    'filterSellableProducts',
    'isSellableProductType',
    'compileTenantPosCatalog',
    'catalogRevision',
  ]),
  'Runtime POS catalog must filter non-sellable/raw ingredient products and publish revisioned catalog state.',
);

check(
  'product-price-snapshot-preserved',
  includesAll(source.orderComposer + source.productCatalog, [
    'snapshot',
    'price',
    'resolveSaleProductPrice',
    'catalogRevision',
  ]),
  'Order lines carry price/product snapshot markers so old checks are not broken by product price changes.',
  'medium',
);

check(
  'product-import-and-template-import-present',
  includesAll(source.productsPage, ['Upload', 'import', 'payload.products'])
    && exists('app/api/templates/import/route.ts')
    && exists('app/api/templates/packs/import/route.ts'),
  'Product/template import surfaces exist; Excel-specific browser proof still needs live UI test data.',
  'medium',
);

check(
  'recipe-stock-engine-present',
  includesAll(source.recipeEngine, ['recipe', 'stock', 'unit', 'quantity'])
    && /kg|gr|lt|ml/.test(source.recipeEngine),
  'Recipe/stock engine includes unit and quantity handling for stock deduction contracts.',
  'medium',
);

check(
  'printer-mobile-to-agent-queue',
  includesAll(source.printerRequestsRoute + source.printerLocalAgentPrintRoute, [
    'printer.job.queued',
    'tenantDeviceRegistry.findFirst',
    'branchId',
    'printerName',
    'printerRole',
  ]),
  'Mobile/API print requests queue tenant/branch-scoped jobs for an active local agent bridge.',
);

check(
  'printer-agent-tenant-branch-discovery',
  includesAll(source.printerLocalAgentRoute, [
    'requireTenant',
    'OR: [{ branchId }, { branchId: null }]',
    'filterRegisteredPrintersByBranch',
    'metadata.branchId',
  ]),
  'Local agent discovery returns only tenant and branch-scoped registered printers.',
);

check(
  'device-registry-captures-installed-printers',
  includesAll(source.deviceRegistryRoute, [
    'tenantDeviceRegistry.upsert',
    'installedPrinters',
    'tenantId',
    'branchId',
  ]),
  'Computer agent can register installed printers for later mobile order printing.',
);

check(
  'mobile-payment-ui-guard-registered',
  exists(files.mobileUiScript) && includesAll(source.mobileUiScript, [
    'payment-action-footer-sticky',
    'mobile-toolbar-horizontal-scroll',
    'viewportsCoveredByContract',
  ]),
  'Mobile POS UI guard exists for 360/390/414 width contracts.',
);

check(
  'live-pos-business-flow-still-covers-db-printer-table-empty',
  includesAll(source.livePosScript, [
    'table remains empty after 5 seconds',
    'payment row created once',
    'cash movement row created once',
    'printer roles registered',
    'tenant B cannot see tenant A table/order',
    'tenant B cannot see tenant A payment',
  ]),
  'Existing live verifier covers payment DB proof, stale table prevention, printer roles, and tenant B isolation.',
);

check(
  'printer-tenant-scope-regression-script-present',
  exists(files.printerTenantScopeScript) && includesAll(source.printerTenantScopeScript, [
    'Tenant B must not see Tenant A printer mappings',
    'Mappings must be role-separated',
  ]),
  'Printer tenant isolation regression script exists.',
  'medium',
);

check(
  'schema-indexes-for-real-usage-models',
  includesAll(source.schema, [
    'model Payment',
    'model CashTransaction',
    'model TenantDeviceRegistry',
    'model Printer',
    '@@index([tenantId',
  ]),
  'Schema contains tenant-indexed core models for payment, cash, device, and printer flows.',
  'medium',
);

const liveRequested = process.env.LIVE_TEST_REQUIRE_DB_PROOF === '1';
const liveEnvReady = Boolean(
  process.env.LIVE_TEST_BASE_URL
    && process.env.LIVE_TEST_TENANT_ID
    && process.env.LIVE_TEST_USERNAME
    && process.env.LIVE_TEST_BRANCH_ID
    && process.env.DATABASE_URL,
);

const failed = checks.filter((item) => !item.ok);
const report = {
  ok: failed.length === 0,
  mode: liveRequested ? 'live-db-requested' : 'local-static-contract',
  liveDbProof: liveRequested
    ? {
        ready: liveEnvReady,
        status: liveEnvReady
          ? 'environment-ready-run-live-http-db-flow-separately'
          : 'wrong-environment-missing-live-db-or-credentials',
      }
    : {
        ready: false,
        status: 'not-requested-local-static-contract-only',
      },
  checks,
  failed,
  caveats: [
    'This script proves source-level contracts and local regressions.',
    'Live restaurant proof still requires VPS DB/network access with LIVE_TEST_REQUIRE_DB_PROOF=1.',
    'Real browser pixel proof requires a running app and Playwright/browser access.',
  ],
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

if (liveRequested && !liveEnvReady) {
  console.error('[restaurant-real-usage-flow] FAIL wrong environment for requested DB proof');
  console.error(JSON.stringify(report.liveDbProof));
  process.exit(1);
}

if (failed.length > 0) {
  console.error('[restaurant-real-usage-flow] FAIL');
  for (const item of failed) console.error(`- ${item.id}: ${item.evidence}`);
  process.exit(1);
}

console.log('[restaurant-real-usage-flow] PASS', JSON.stringify({
  mode: report.mode,
  checks: checks.length,
  liveDbProof: report.liveDbProof.status,
  reportPath,
}));
