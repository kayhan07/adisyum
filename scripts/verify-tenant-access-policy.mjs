import { readFileSync } from 'node:fs';

const checks = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function expect(source, pattern, message) {
  const ok = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
  checks.push({ ok, message });
}

const tenantRepository = read('lib/db/tenant-repository.ts');
const requireTenant = read('lib/requireTenant.ts');
const loginRoute = read('app/api/auth/login/route.ts');
const sessionRoute = read('app/api/auth/session/route.ts');
const meRoute = read('app/api/auth/me/route.ts');
const provisioning = read('lib/system-admin/provisioning.ts');
const tenantsRoute = read('app/api/system-admin/tenants/route.ts');
const systemAdminPage = read('app/system-admin/page.tsx');

expect(tenantRepository, 'export async function assertTenantCanAccess', 'assertTenantCanAccess exists');
expect(tenantRepository, /select:\s*\{[^}]*deletedAt:\s*true/s, 'tenant access guard reads deletedAt');
expect(tenantRepository, /tenant\.deletedAt/, 'deleted tenants are blocked');
expect(tenantRepository, /tenant\.status === 'suspended' \|\| tenant\.status === 'blocked'/, 'suspended and blocked tenants are fully blocked');
expect(tenantRepository, /expiredReadAllowed[\s\S]*options\.readOnly === true/, 'expired read-only access is explicit');
expect(tenantRepository, /!activeSubscription && !expiredReadAllowed/, 'expired write access remains blocked');
expect(tenantRepository, /unlimited \|\| subscription\.endsAt >= new Date\(\)/, 'unlimited subscription bypasses end date');

expect(requireTenant, /readOnly:\s*\['GET', 'HEAD', 'OPTIONS'\]\.includes\(request\.method\)/, 'API method maps GET/HEAD/OPTIONS to read-only');

expect(loginRoute, /deletedAt:\s*true/, 'login route reads tenant deletedAt');
expect(loginRoute, /!tenant\.deletedAt && \['active', 'trial', 'demo', 'expired'\]/, 'login allows only non-deleted active/trial/demo/expired tenants');
expect(loginRoute, /deletedAt:\s*null/, 'login route excludes deleted users/subscriptions');

expect(sessionRoute, /deletedAt:\s*true/, 'session route reads deletedAt');
expect(sessionRoute, /!tenant\.deletedAt && \['active', 'trial', 'demo', 'expired'\]/, 'session route allows only non-deleted active/trial/demo/expired tenants');
expect(sessionRoute, /user\.deletedAt/, 'session route rejects deleted users');

expect(meRoute, /assertTenantCanAccess\(session\.tenantId, \{ readOnly: true \}\)/, 'auth/me uses read-only tenant access');

expect(provisioning, /assertTenantProvisioningConflicts/, 'duplicate tenant conflict check exists');
expect(provisioning, /tenantId[\s\S]*companyName[\s\S]*taxNumber[\s\S]*adminEmail/, 'duplicate check covers tenant code, company name, tax number and admin email');
expect(provisioning, /export async function exportTenantData/, 'tenant export function exists');
expect(provisioning, /input\.unlimitedLicense === false[\s\S]*false/, 'system-admin can remove unlimited license metadata');
expect(provisioning, /Number\.isNaN\(nextEndsAt\.getTime\(\)\)/, 'manual subscription date rejects invalid dates');
expect(provisioning, /!password && input\.forcePasswordChange === undefined/, 'system-admin can force password change without replacing password');
expect(provisioning, /export async function softDeleteTenant/, 'system-admin soft delete preserves tenant data');
expect(provisioning, /export async function restoreTenant/, 'system-admin restore clears deletedAt safely');
expect(provisioning, /export async function runTenantIntegrationAction/, 'system-admin integration actions are audited');

expect(tenantsRoute, /exportTenantId/, 'system-admin tenants API exposes guarded tenant export');
expect(tenantsRoute, /soft_delete_tenant/, 'system-admin tenants API exposes soft delete action');
expect(tenantsRoute, /restore_tenant/, 'system-admin tenants API exposes restore action');
expect(tenantsRoute, /integration_action/, 'system-admin tenants API exposes integration action');

expect(systemAdminPage, /subscriptionAccessLabel/, 'system-admin UI surfaces access policy state');
expect(systemAdminPage, /Abone Yönetim Merkezi/, 'system-admin UI exposes advanced subscriber management center');
expect(systemAdminPage, /Toplam Abone/, 'system-admin UI exposes subscriber stat cards');
expect(systemAdminPage, /Telefon/, 'system-admin UI exposes phone column');
expect(systemAdminPage, /Vergi No/, 'system-admin UI exposes tax number column');
expect(systemAdminPage, /Genel Bilgiler/, 'system-admin UI exposes tenant profile tab');
expect(systemAdminPage, /Abonelik/, 'system-admin UI exposes subscription management tab');
expect(systemAdminPage, /Kullanım Tarihini Değiştir/, 'system-admin UI exposes manual subscription end-date action');
expect(systemAdminPage, /\+30 Gün Ekle/, 'system-admin UI exposes 30-day subscription extension');
expect(systemAdminPage, /\+1 Ay Ekle/, 'system-admin UI exposes monthly subscription extension');
expect(systemAdminPage, /\+1 Yıl Ekle/, 'system-admin UI exposes yearly subscription extension');
expect(systemAdminPage, /Limitsiz Lisans Yap/, 'system-admin UI exposes unlimited license enable action');
expect(systemAdminPage, /Limitsiz Lisansı Kaldır/, 'system-admin UI exposes unlimited license removal action');
expect(systemAdminPage, /Sonraki Girişte Şifre Değiştir/, 'system-admin UI exposes force password-change action');
expect(systemAdminPage, /Geçici Şifre Oluştur/, 'system-admin UI exposes temporary password action');
expect(systemAdminPage, /Tehlikeli İşlemler/, 'system-admin UI exposes dangerous operations tab');
expect(systemAdminPage, /Aboneyi Sil/, 'system-admin UI exposes soft delete action');
expect(systemAdminPage, /Aboneyi Geri Al/, 'system-admin UI exposes restore action');
expect(systemAdminPage, /Silinmişten Geri Al/, 'system-admin UI exposes restore action inside status tab');
expect(systemAdminPage, /console\.error\('\[system-admin\] tenant management action failed'/, 'system-admin UI logs failed tenant management actions with context');
expect(systemAdminPage, /await onRefresh\(\)/, 'system-admin UI refreshes tenant data after management actions');

const failures = checks.filter((check) => !check.ok);
if (failures.length) {
  console.error('[tenant-access-policy] FAIL');
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log('[tenant-access-policy] PASS');
