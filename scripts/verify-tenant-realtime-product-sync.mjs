import { readFileSync } from 'node:fs';

const checks = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function expect(name, condition, detail = '') {
  checks.push({ name, ok: Boolean(condition), detail });
}

const orderComposer = read('components/order-composer.tsx');
const productsPage = read('app/products/page.tsx');
const productsBulkRoute = read('app/api/products/bulk/route.ts');
const posCatalogRoute = read('app/api/runtime/pos-catalog/route.ts');
const runtimeStateRoute = read('app/api/runtime/state/[scope]/route.ts');
const tableOrdersRoute = read('app/api/pos/table-orders/route.ts');
const domainServices = read('lib/services/domain-services.ts');
const tenantEvents = read('lib/realtime/tenant-events.ts');

expect(
  'POS catalog GET uses tenant auth',
  posCatalogRoute.includes('requireTenant(request)'),
);
expect(
  'POS catalog GET compiles server DB catalog',
  posCatalogRoute.includes('compileTenantPosCatalog(tenant.tenantId, branchId, channel)'),
);
expect(
  'Order composer accepts server catalog as source of truth even when empty',
  orderComposer.includes('setStoredCatalogProducts(catalog.items)'),
);
expect(
  'Order composer no longer rehydrates empty server catalog from local created products',
  !orderComposer.includes('localCreatedProducts'),
);
expect(
  'Order composer gates local sale product cache to offline fallback',
  orderComposer.includes('if (isOnline)') && orderComposer.includes('setStoredCatalogProducts([])'),
);
expect(
  'Order composer refreshes server catalog across devices',
  orderComposer.includes("hydrateRuntimeCatalog('interval')") && orderComposer.includes('setInterval') && orderComposer.includes('5000'),
);
expect(
  'Order composer refetches catalog on focus/visibility',
  orderComposer.includes('window.addEventListener(\'focus\', handleFocus)') && orderComposer.includes('visibilitychange'),
);
expect(
  'Products page hydrates list from server bulk API',
  productsPage.includes("fetch('/api/products/bulk'") && productsPage.includes('setSaleProducts(serverSaleProducts)'),
);
expect(
  'Products page refreshes server products across devices',
  productsPage.includes('serverRefreshNonce') && productsPage.includes('setInterval(triggerServerRefresh, 5000)'),
);
expect(
  'Manual sale product create persists to server before local UI add',
  productsPage.includes("persistBulkProductsToServer([{") && productsPage.includes("'manual-create'"),
);
expect(
  'Selected product save persists updates to server',
  productsPage.includes('saveSelectedProductToServer') && productsPage.includes("'manual-update'"),
);
expect(
  'Selected product delete uses server lifecycle delete',
  productsPage.includes("fetch('/api/products/lifecycle'") && productsPage.includes("action: 'delete'"),
);
expect(
  'Excel/manual bulk product save invalidates POS catalog',
  productsBulkRoute.includes('invalidateRuntimePosCatalog(tenant.tenantId') && productsBulkRoute.includes('catalogInvalidationRequired: true'),
);
expect(
  'Bulk product save publishes tenant product event',
  productsBulkRoute.includes('publishTenantEvent') && productsBulkRoute.includes("'products'"),
);
expect(
  'Bulk product save distinguishes create/update/import events',
  productsBulkRoute.includes("'product.imported'") && productsBulkRoute.includes("'product.created'") && productsBulkRoute.includes("'product.updated'"),
);
expect(
  'Runtime state guards tenant snapshots and prunes sale-product runtime cache',
  runtimeStateRoute.includes('snapshotTenantId') && runtimeStateRoute.includes('SALE_PRODUCTS_RUNTIME_KEY'),
);
expect(
  'Table order mutations publish order.updated event',
  tableOrdersRoute.includes("type: 'order.updated'") && tableOrdersRoute.includes("publishTenantEvent(tenantId, 'orders'"),
);
expect(
  'Payment service publishes payment.created event',
  domainServices.includes("type: 'payment.created'") && domainServices.includes("'payments'"),
);
expect(
  'Stock service publishes stock update event',
  domainServices.includes("type: 'stock.adjusted'") && domainServices.includes("'stock'"),
);
expect(
  'Tenant event channel is tenant scoped',
  tenantEvents.includes('tenant:${tenantId}:${scope}'),
);

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` - ${check.detail}` : ''}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} tenant product sync checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} tenant product sync checks passed.`);
