import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} missing: ${needle}`);
  }
}

function assertNotContains(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`${label} must not contain: ${needle}`);
  }
}

function functionBody(source, name) {
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) throw new Error(`${name} missing`);
  const next = source.indexOf('\nexport async function ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function componentBody(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`${name} missing`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

const provisioning = read('lib/system-admin/provisioning.ts');
const tenantsRoute = read('app/api/system-admin/tenants/route.ts');
const resetPreviewRoute = read('app/api/system-admin/tenants/[tenantId]/reset-preview/route.ts');
const resetDataRoute = read('app/api/system-admin/tenants/[tenantId]/reset-data/route.ts');
const systemAdminPage = read('app/system-admin/page.tsx');
const packageJson = read('package.json');

const resetBody = functionBody(provisioning, 'resetTenantBusinessData');
const tenantsModuleBody = componentBody(systemAdminPage, 'TenantsModule');

assertContains(provisioning, "action: 'reset_tenant_data';", 'Tenant management action type');
assertContains(provisioning, 'export const TENANT_DATA_RESET_MODULES', 'Tenant reset module registry');
assertContains(provisioning, 'previewTenantBusinessDataReset', 'Tenant reset dry-run preview function');
assertContains(provisioning, 'normalizeTenantDataResetModules', 'Tenant reset rejects empty/invalid module selections');
assertContains(resetBody, 'confirmationTenantId.trim().toUpperCase() !== tenantId', 'Tenant data reset confirmation guard');
assertContains(resetBody, 'tx.orderItem.deleteMany({ where: { tenantId } })', 'Tenant data reset clears order items');
assertContains(resetBody, 'tx.payment.deleteMany({ where: { tenantId } })', 'Tenant data reset clears payments');
assertContains(resetBody, 'tx.cashTransaction.deleteMany({ where: { tenantId } })', 'Tenant data reset clears cash transactions');
assertContains(resetBody, "productType: { in: ['sale_product', 'combo_product'] }", 'Tenant data reset can clear sale products by module');
assertContains(resetBody, "productType: 'stock_item'", 'Tenant data reset can clear raw materials by module');
assertContains(resetBody, 'tx.productCategory.deleteMany({ where: { tenantId } })', 'Tenant data reset clears product categories');
assertContains(resetBody, 'tx.posTable.deleteMany({ where: { tenantId } })', 'Tenant data reset clears floor tables');
assertContains(resetBody, 'tx.runtimeState.deleteMany({ where: { tenantId } })', 'Tenant data reset clears runtime state');
assertContains(resetBody, 'tx.session.updateMany({ where: { tenantId, revokedAt: null }', 'Tenant data reset revokes active sessions');
assertContains(resetBody, "actionName: 'system_admin_tenant_data_reset'", 'Tenant data reset writes audit log');
assertNotContains(resetBody, 'tx.tenant.deleteMany', 'Tenant data reset preserves tenant shell');
assertNotContains(resetBody, 'tx.subscription.deleteMany', 'Tenant data reset preserves subscription');
assertNotContains(resetBody, 'tx.branch.deleteMany', 'Tenant data reset preserves branch');
assertNotContains(resetBody, 'tx.user.deleteMany', 'Tenant data reset preserves admin user');
assertNotContains(resetBody, 'tx.role.deleteMany', 'Tenant data reset preserves tenant roles');

assertContains(tenantsRoute, 'resetTenantBusinessData', 'System-admin tenant API imports reset action');
assertContains(tenantsRoute, "body.action === 'reset_tenant_data'", 'System-admin tenant API handles reset action');
assertContains(tenantsRoute, 'confirmationTenantId: body.confirmationTenantId', 'System-admin tenant API passes confirmation');
assertContains(resetPreviewRoute, 'requireSystemAdmin(request)', 'Reset preview endpoint requires system admin');
assertContains(resetPreviewRoute, 'previewTenantBusinessDataReset', 'Reset preview endpoint uses dry-run function');
assertContains(resetDataRoute, 'requireSystemAdmin(request)', 'Reset data endpoint requires system admin');
assertContains(resetDataRoute, 'dryRun', 'Reset data endpoint supports dry-run body');
assertContains(resetDataRoute, 'confirmationTenantId', 'Reset data endpoint requires confirmation');

assertContains(systemAdminPage, 'Tenant Veri Temizleme', 'System-admin drawer exposes data reset panel');
assertContains(systemAdminPage, "action: 'reset_tenant_data'", 'System-admin drawer submits data reset action');
assertContains(systemAdminPage, 'dataResetTenantConfirmed', 'System-admin drawer requires tenant id confirmation');
assertContains(systemAdminPage, 'TENANT_DATA_RESET_MODULE_OPTIONS', 'System-admin drawer exposes module checklist');
assertContains(systemAdminPage, 'Dry-run Önizle', 'System-admin drawer exposes dry-run button');
assertContains(systemAdminPage, 'dataResetModules.length === 0', 'System-admin drawer starts with no selected modules');
assertContains(systemAdminPage, 'Tüm modülleri seç', 'System-admin drawer lets operators select all reset modules');
assertContains(systemAdminPage, 'Seçimi temizle', 'System-admin drawer lets operators clear reset module selection');
assertContains(systemAdminPage, 'dataResetHint', 'System-admin drawer explains why reset action is disabled');
assertContains(systemAdminPage, 'dataResetReady', 'System-admin drawer computes explicit reset readiness');
assertContains(tenantsModuleBody, 'confirmReset', 'Tenant list exposes explicit reset confirmation path');
assertContains(tenantsModuleBody, 'Veriyi Temizle', 'Tenant list exposes data reset action per subscriber');
assertContains(tenantsModuleBody, 'lg:grid-cols-[minmax(14rem,1.15fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)_minmax(16rem,1fr)]', 'Tenant list uses responsive card rows');
assertNotContains(tenantsModuleBody, '<DataTable', 'Tenant list no longer uses horizontally scrolling DataTable');
assertContains(packageJson, '"verify:system-admin-tenant-data-reset"', 'package.json exposes requested system-admin reset verification script');

console.log('PASS system-admin tenant data reset keeps tenant shell and clears business data');
