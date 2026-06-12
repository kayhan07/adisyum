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

const provisioning = read('lib/system-admin/provisioning.ts');
const tenantsRoute = read('app/api/system-admin/tenants/route.ts');
const systemAdminPage = read('app/system-admin/page.tsx');

const resetBody = functionBody(provisioning, 'resetTenantBusinessData');

assertContains(provisioning, "action: 'reset_tenant_data';", 'Tenant management action type');
assertContains(resetBody, 'confirmationTenantId.trim().toUpperCase() !== tenantId', 'Tenant data reset confirmation guard');
assertContains(resetBody, 'tx.orderItem.deleteMany({ where: { tenantId } })', 'Tenant data reset clears order items');
assertContains(resetBody, 'tx.payment.deleteMany({ where: { tenantId } })', 'Tenant data reset clears payments');
assertContains(resetBody, 'tx.cashTransaction.deleteMany({ where: { tenantId } })', 'Tenant data reset clears cash transactions');
assertContains(resetBody, 'tx.product.deleteMany({ where: { tenantId } })', 'Tenant data reset clears products');
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

assertContains(systemAdminPage, 'Tenant Veri Temizleme', 'System-admin drawer exposes data reset panel');
assertContains(systemAdminPage, "action: 'reset_tenant_data'", 'System-admin drawer submits data reset action');
assertContains(systemAdminPage, 'dataResetConfirmation.trim().toUpperCase() !== tenantId.toUpperCase()', 'System-admin drawer requires tenant id confirmation');

console.log('PASS system-admin tenant data reset keeps tenant shell and clears business data');
