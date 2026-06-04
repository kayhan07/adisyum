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

const provisioning = read('lib/system-admin/provisioning.ts');
const cleanStart = read('lib/tenant-clean-start.ts');
const posCatalogRoute = read('app/api/runtime/pos-catalog/route.ts');
const runtimeCatalog = read('lib/server/runtime-pos-catalog.ts');
const tableStateRoute = read('app/api/runtime/table-state/route.ts');
const tableOrdersRoute = read('app/api/pos/table-orders/route.ts');
const systemAdminTenantRoute = read('app/api/system-admin/tenants/route.ts');
const companyRoute = read('app/api/settings/company/route.ts');

const forbiddenBusinessCreates = [
  'product.create',
  'productCategory.create',
  'recipe.create',
  'rawMaterial.create',
  'stockMovement.create',
  'cashTransaction.create',
  'cashRegister.create',
  'currentAccountMovement.create',
  'payment.create',
  'printer.create',
  'runtimeState.create',
  'order.create',
  'orderItem.create',
];

const allowedProvisioningMarkers = [
  'tenant.create',
  'subscription.create',
  'adminUser',
  'roles-created',
  'ROLE_PERMISSIONS',
  'companyName',
];

for (const marker of allowedProvisioningMarkers) {
  assert(provisioning.includes(marker), `Provisioning must still create allowed bootstrap record: ${marker}`);
}

for (const marker of forbiddenBusinessCreates) {
  const createIndex = provisioning.indexOf(marker);
  const cleanupIndex = provisioning.indexOf(marker.replace('.create', '.deleteMany'));
  assert(createIndex === -1 || (cleanupIndex > -1 && cleanupIndex < createIndex), `New tenant provisioning must not seed business data via ${marker}`);
}

assert(posCatalogRoute.includes('demoFallbackUsed: false'), 'POS catalog API must explicitly reject demo fallback');
assert(posCatalogRoute.includes('tenant_catalog_empty'), 'Empty POS catalog must be reported as a clean tenant catalog');
assert(runtimeCatalog.includes('where: {') && runtimeCatalog.includes('tenantId,'), 'Runtime POS catalog must query by tenantId');
assert(!runtimeCatalog.includes('demoProducts') && !runtimeCatalog.includes('demoMenu'), 'Runtime POS catalog must not import demo products');

assert(cleanStart.includes('LEGACY_DEMO_TENANT_ID'), 'Client clean-start guard must know the legacy demo tenant id');
assert(cleanStart.includes('purgeLegacyDemoTenantClientState'), 'Client must purge legacy demo tenant state');
assert(cleanStart.includes('resetTenantBusinessCachesForLogin'), 'Login must reset tenant business caches');
assert(cleanStart.includes('aurelia-table-payment-requested'), 'Clean-start must include payment requested runtime keys');
assert(cleanStart.includes('adisyon-finance-account-transactions'), 'Clean-start must include finance local cache keys');

assert(tableStateRoute.includes('getDefaultState()'), 'Runtime table-state must return an empty default state for clean tenants');
assert(tableStateRoute.includes('paymentRequestedTableIds: []'), 'Runtime table-state default must have no payment requested tables');
assert(tableStateRoute.includes('ordersByTable: {}'), 'Runtime table-state default must have no orders');
assert(tableOrdersRoute.includes("where: { tenantId, status: 'open', orderNo: { startsWith: 'TABLE-' } }"), 'POS open-order hydration must be tenant scoped and open-order only');

for (const field of ['taxNumber', 'phone', 'email', 'contactName', 'address', 'notes']) {
  assert(systemAdminTenantRoute.includes(field), `System Admin tenant create must accept and forward company field: ${field}`);
  assert(provisioning.includes(`input.${field}`), `Tenant provisioning must persist company field from System Admin create: ${field}`);
}

assert(provisioning.includes("source: 'system-admin-control-center'"), 'Provisioned tenant company metadata must record System Admin as source');
assert(provisioning.includes("name: input.branchName?.trim() || 'Merkez Şube'"), 'Provisioning must create only a tenant-scoped default branch');
assert(provisioning.includes('assertProvisionedTenantCleanStart'), 'System Admin provisioning must run clean-start validation after tenant create');
for (const model of ['product', 'order', 'payment', 'cashTransaction', 'currentAccountMovement', 'printer', 'runtimeState']) {
  assert(provisioning.includes(`prisma.${model}.count({ where: { tenantId } })`), `Clean-start validation must count ${model} records`);
}
assert(companyRoute.includes('where: { tenantId: tenant.tenantId }'), 'Company profile GET/PUT must query the authenticated tenant only');
assert(companyRoute.includes('tenantId_branchId: { tenantId: tenant.tenantId, branchId }'), 'Company branch profile must be tenant + branch scoped');
assert(companyRoute.includes('profileUpdatedBy: tenant.userId'), 'Company profile updates must be attributable to the tenant user');
assert(companyRoute.includes('companyPayload'), 'Company API must return a normalized tenant-scoped company payload');

if (failures.length > 0) {
  console.error('[tenant:clean-start] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[tenant:clean-start] PASS');
