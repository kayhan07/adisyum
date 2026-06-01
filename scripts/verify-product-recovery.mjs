import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function walk(dir, files = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return files;

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
    const entryPath = path.join(absolute, entry.name);
    const relativePath = path.relative(root, entryPath).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      walk(relativePath, files);
      continue;
    }
    if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) files.push(relativePath);
  }

  return files;
}

function filesContaining(files, pattern) {
  return files.filter((file) => pattern.test(read(file)));
}

const provider = read('components/providers/app-runtime-provider.tsx');
const orderComposer = read('components/order-composer.tsx');
const qrMenuState = read('lib/qr-menu-state.ts');
const saleProductCatalog = read('lib/sale-product-catalog.ts');
const runtimeApi = read('lib/runtime/runtime-api.ts');
const authLock = read('lib/runtime/auth-failure-runtime-lock.ts');
const appShell = read('components/app-shell.tsx');
const middleware = read('middleware.ts');
const kdsBoard = read('components/kds/kds-board.tsx');
const productPage = read('app/products/page.tsx');
const secureLogout = read('lib/client/secure-logout.ts');
const appLogin = read('app/app/login/page.tsx');
const systemAdminLogin = read('app/system-admin/login/page.tsx');

assert(exists('PRODUCT_RECOVERY_CHECKLIST.md'), 'PRODUCT_RECOVERY_CHECKLIST.md must exist');
assert(exists('PRODUCT_RUNTIME_QA.md'), 'PRODUCT_RUNTIME_QA.md must exist');
assert(exists('FRONTEND_RUNTIME_FORENSICS.md'), 'FRONTEND_RUNTIME_FORENSICS.md must exist');
assert(exists('MODULE_RECOVERY_MATRIX.md'), 'MODULE_RECOVERY_MATRIX.md must exist');
assert(exists('AUTH_BOUNDARY_FORENSICS.md'), 'AUTH_BOUNDARY_FORENSICS.md must exist');
assert(exists('ROOT_RUNTIME_RECOVERY.md'), 'ROOT_RUNTIME_RECOVERY.md must exist');
assert(exists('ACCESS_RECOVERY_CHECKLIST.md'), 'ACCESS_RECOVERY_CHECKLIST.md must exist');
assert(exists('API_DRIFT_FORENSICS.md'), 'API_DRIFT_FORENSICS.md must exist');

assert(/const PRODUCT_RECOVERY_MINIMAL_RUNTIME = true;/.test(provider), 'AppRuntimeProvider must keep product recovery minimal runtime enabled');
assert(/usePathname/.test(provider), 'AppRuntimeProvider must know the current route for auth entry bypass');
assert(/isAuthEntryRoute = pathname === '\/app\/login' \|\| pathname === '\/system-admin\/login'/.test(provider), 'AppRuntimeProvider must identify auth entry routes');
assert(/enabled: !isAuthEntryRoute/.test(provider), 'Auth entry routes must not run the global auth session query');
assert(/if \(!isFetched \|\| !ready\) return <>\{children\}<\/>;/.test(provider), 'AppRuntimeProvider must render children immediately instead of blanking the UI');
assert(!/if \(!isFetched \|\| !ready\) return null;/.test(provider), 'AppRuntimeProvider must not return null during bootstrap');
assert((provider.match(/if \(PRODUCT_RECOVERY_MINIMAL_RUNTIME\) return;/g) ?? []).length >= 3, 'AppRuntimeProvider must disable non-essential runtime loops in product recovery mode');
assert(/const validateSession = async \(\) =>/.test(provider), 'AppRuntimeProvider must keep the lightweight auth revocation check enabled in product recovery mode');
assert(/window\.addEventListener\('focus', onFocus\)/.test(provider), 'AppRuntimeProvider must revalidate auth when the protected app regains focus');
assert(/document\.addEventListener\('visibilitychange', onVisibility\)/.test(provider), 'AppRuntimeProvider must revalidate auth when the protected app becomes visible');
assert(/function ingestObservability[\s\S]*PRODUCT_RECOVERY_MINIMAL_RUNTIME/.test(provider), 'Non-essential observability must be disabled in product recovery mode');

assert(!/startAuthoritativeRuntimeSync/.test(orderComposer), 'OrderComposer must not start aggressive authoritative background sync');
assert(/authoritative-orders-background-sync-disabled/.test(orderComposer), 'OrderComposer must explicitly keep background sync disabled during recovery');
assert(/offline-auto-sync-disabled/.test(orderComposer), 'OrderComposer must explicitly keep offline auto-sync disabled during recovery');
assert(/hydrateAuthoritativeRuntime/.test(orderComposer), 'OrderComposer must retain one bounded initial table hydration');
assert(/!Array\.isArray\(catalog\?\.items\)/.test(orderComposer), 'OrderComposer must accept authoritative empty POS catalogs');
assert(!/!catalog\?\.items\?\.length/.test(orderComposer), 'OrderComposer must not preserve stale product cards when authoritative POS catalog is empty');
assert(/localCreatedProducts/.test(orderComposer), 'OrderComposer must preserve locally created tenant products when the DB catalog is still empty');
assert(/shouldUseSeedBusinessData/.test(qrMenuState), 'QR menu default catalog must be restricted to the seed tenant');
assert(!/sale-product-storage-save-existing/.test(saleProductCatalog), 'Sale product persistence must replace the stored snapshot so deleted products cannot return after refresh');
assert(/await bootstrapRuntimeScope\('tenant'\)/.test(provider), 'Tenant runtime snapshot bootstrap must remain enabled in product recovery mode');

assert(/POS_TABLE_ORDERS_API = '\/api\/pos\/table-orders'/.test(runtimeApi), 'POS table order mutations must use the root /api/pos/table-orders endpoint');
assert(/RUNTIME_POS_CATALOG_API = '\/api\/runtime\/pos-catalog'/.test(runtimeApi), 'Runtime API must explicitly allow /api/runtime/pos-catalog');
assert(/credentials: init\.credentials \?\? 'include'/.test(runtimeApi), 'Runtime API calls must include credentials by default');
assert(/adisyonsistemi\/api/.test(runtimeApi) && /\/app\/api/.test(runtimeApi), 'Runtime API must reject legacy-prefixed API namespaces');
assert(runtimeApi.includes('normalized.split(/[?#]/, 1)'), 'Runtime API drift detection must compare pathname without query/hash');
assert(!/url\.pathname !== normalized\)/.test(runtimeApi), 'Runtime API must not compare pathname to a query-bearing normalized URL');
assert(/invalid_runtime_api_path/.test(runtimeApi), 'Runtime API invalid path handling must fail request safely instead of crashing render');
assert(/console\.warn\('\[runtime-api\] API path drift detected'/.test(runtimeApi), 'Runtime API drift detection must warn instead of throwing through render');
assert(!/throw new Error\(`\[runtime-api\]/.test(runtimeApi), 'Runtime API guard must not throw runtime-api errors through the POS render tree');
assert(/runtimeFetch\(`\/api\/runtime\/pos-catalog/.test(orderComposer), 'POS catalog hydration must continue using /api/runtime/pos-catalog');
assert(/lockRuntimeForAuthFailure/.test(runtimeApi), 'Runtime API must lock runtime work after 401 responses');
assert(/AUTH_REQUIRED/.test(authLock) && /redirectIssued/.test(authLock), 'Auth failure runtime lock must expose AUTH_REQUIRED state and one-shot redirect state');

assert(!/useRouter/.test(appShell), 'AppShell must not own auth redirect routing');
assert(!/router\.replace\(['"]\/app['"]\)/.test(appShell), 'AppShell must not recursively redirect modules to /app');
assert(!/authReady/.test(appShell), 'AppShell must not block module rendering on client-only auth readiness');

assert(/isLegacyAdisyonPath/.test(middleware), 'Middleware must explicitly canonicalize legacy /adisyonsistemi paths');
assert(!/searchParams\.set\(['"]next['"]/.test(middleware), 'Middleware must not create next query redirect chains');
assert(/'\/app\/login'/.test(middleware), 'Middleware must expose /app/login as the unauthenticated app entry');
assert(/'\/system-admin\/login'/.test(middleware), 'Middleware must expose /system-admin/login as the unauthenticated system-admin entry');
assert(/pathname === '\/app\/login'/.test(middleware), 'Middleware must explicitly handle /app/login');
assert(/pathname === '\/system-admin\/login'/.test(middleware), 'Middleware must explicitly handle /system-admin/login');
assert(/publicRedirectUrl\(request, pathname\.startsWith\('\/system-admin'\) \? '\/system-admin\/login' : '\/app\/login'\)/.test(middleware), 'Invalid sessions must stay inside their auth domain');
assert(!/pathname\.startsWith\('\/system-admin'\) \? '\/system-admin' : '\/app\/login'/.test(middleware), 'System-admin must not bounce unauthenticated users to /system-admin without login ownership');
assert(!/publicRedirectUrl\(request, '\/app'\)[\s\S]{0,120}system-admin_forbidden/.test(middleware), 'Invalid system-admin browser sessions must not redirect into /app');
assert(exists('app/adisyonsistemi/page.tsx'), 'Legacy /adisyonsistemi page must exist only as a redirect shell');
assert(/permanentRedirect\(['"]\/app['"]\)/.test(read('app/adisyonsistemi/page.tsx')), '/adisyonsistemi must permanently redirect to /app');
assert(/window\.location\.replace\(target\)/.test(secureLogout) && /'\/app\/login'/.test(secureLogout), 'Logout must return app users to /app/login');
assert(/'\/system-admin\/login'/.test(secureLogout), 'Logout must return system-admin users to /system-admin/login');
assert(/runtimeFetch\('\/api\/auth\/login'/.test(appLogin), '/app/login must perform manual login via /api/auth/login');
assert(/router\.replace\('\/app'\)/.test(appLogin), '/app/login must navigate once to /app after successful manual login');
assert(!/localStorage|sessionStorage/.test(appLogin), '/app/login must not restore auth from browser storage');
assert(/runtimeFetch\('\/api\/auth\/system-admin'/.test(systemAdminLogin), '/system-admin/login must perform manual login via /api/auth/system-admin');
assert(/router\.replace\('\/system-admin'\)/.test(systemAdminLogin), '/system-admin/login must navigate once to /system-admin after successful manual login');
assert(!/localStorage|sessionStorage/.test(systemAdminLogin), '/system-admin/login must not restore auth from browser storage');

assert(/<Suspense fallback=\{null\}>/.test(productPage), 'Products page must wrap useSearchParams content in Suspense');
assert(/const reconciliationTimer = window\.setInterval/.test(kdsBoard), 'KDS must keep one bounded fallback polling timer');
assert(/}, 15000\);/.test(kdsBoard), 'KDS fallback polling must be bounded and non-aggressive');

const sourceFiles = [
  ...walk('app'),
  ...walk('components'),
  ...walk('lib'),
  'middleware.ts',
];

const legacyRuntimeRefs = filesContaining(sourceFiles, /adisyonsistemi/).filter((file) => ![
  'app/adisyonsistemi/page.tsx',
  'lib/runtime/runtime-api.ts',
  'middleware.ts',
].includes(file));
assert(legacyRuntimeRefs.length === 0, `Legacy /adisyonsistemi runtime ownership references remain: ${legacyRuntimeRefs.join(', ')}`);

const legacyPrefixedApis = filesContaining(sourceFiles, /\/adisyonsistemi\/api|\/app\/api/).filter((file) => file !== 'lib/runtime/runtime-api.ts');
assert(legacyPrefixedApis.length === 0, `Legacy-prefixed API construction remains: ${legacyPrefixedApis.join(', ')}`);

const recursiveRuntimePatterns = [
  [/startAuthoritativeRuntimeSync\(/, 'aggressive authoritative sync starter'],
];

for (const [pattern, label] of recursiveRuntimePatterns) {
  assert(!pattern.test(provider), `AppRuntimeProvider must not contain active ${label}`);
}

if (failures.length > 0) {
  console.error('Product recovery validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Product recovery validation passed.');
