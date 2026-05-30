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
expect(tenantsRoute, /exportTenantId/, 'system-admin tenants API exposes guarded tenant export');

expect(systemAdminPage, /subscriptionAccessLabel/, 'system-admin UI surfaces access policy state');
expect(systemAdminPage, /Abonelik Yönetimi/, 'system-admin UI exposes subscription management panel');
expect(systemAdminPage, /Kullanım Tarihini Değiştir/, 'system-admin UI exposes manual subscription end-date action');
expect(systemAdminPage, /\+30 Gün Ekle/, 'system-admin UI exposes 30-day subscription extension');
expect(systemAdminPage, /\+1 Ay Ekle/, 'system-admin UI exposes monthly subscription extension');
expect(systemAdminPage, /\+1 Yıl Ekle/, 'system-admin UI exposes yearly subscription extension');
expect(systemAdminPage, /Limitsiz Lisans Yap/, 'system-admin UI exposes unlimited license enable action');
expect(systemAdminPage, /Limitsiz Lisansı Kaldır/, 'system-admin UI exposes unlimited license removal action');
expect(systemAdminPage, /Sonraki Girişte Şifre Değiştir/, 'system-admin UI exposes force password-change action');
expect(systemAdminPage, /Geçici Şifre \+ Zorunlu Değişim/, 'system-admin UI exposes reset password with force-change action');
expect(systemAdminPage, /console\.error\('\[system-admin\] subscription action failed'/, 'system-admin UI logs failed subscription actions with context');
expect(systemAdminPage, /await onRefresh\(\)/, 'system-admin UI refreshes tenant data after management actions');

const failures = checks.filter((check) => !check.ok);
if (failures.length) {
  console.error('[tenant-access-policy] FAIL');
  for (const failure of failures) console.error(`- ${failure.message}`);
  process.exit(1);
}

console.log('[tenant-access-policy] PASS');
