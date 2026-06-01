import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
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

const productionFiles = [
  ...walk('app'),
  ...walk('components'),
  ...walk('lib'),
  'middleware.ts',
].filter((file) => fs.existsSync(path.join(root, file)));

const sourceWithDemoTenant = productionFiles.filter((file) => read(file).includes('ABN-48291'));
assert(
  sourceWithDemoTenant.length === 0,
  `Production source must not contain ABN-48291 fallback references: ${sourceWithDemoTenant.join(', ')}`,
);

const tenantCleanStart = read('lib/tenant-clean-start.ts');
const runtimeState = read('lib/client/runtime-state.ts');
const authMe = read('app/api/auth/me/route.ts');
const provider = read('components/providers/app-runtime-provider.tsx');
const tableLayoutStore = read('lib/table-layout-store.ts');
const saleProductCatalog = read('lib/sale-product-catalog.ts');
const rawIngredientStore = read('lib/raw-ingredient-store.ts');
const recipePool = read('lib/recipe-pool.ts');
const integrationStore = read('lib/integration-store.ts');
const productPage = read('app/products/page.tsx');
const saasStore = read('lib/saas-store.ts');
const systemAdminStore = read('lib/system-admin-store.ts');

assert(/NEXT_PUBLIC_ENABLE_SEED_BUSINESS_DATA === '1'/.test(tenantCleanStart), 'Seed business data must be explicitly disabled unless an env flag enables it');
assert(!/DEFAULT_SEED_TENANT_ID/.test(tenantCleanStart), 'Seed business data must not use a hardcoded default tenant id');
assert(!/tenantId === ['"]ABN-48291['"]/.test(tableLayoutStore + saleProductCatalog + rawIngredientStore + recipePool + integrationStore + productPage), 'Tenant local stores must not read legacy unscoped caches through an ABN fallback');
assert(!/window\.localStorage\.getItem\(LOCAL_STORAGE_KEY\)/.test(tableLayoutStore + saleProductCatalog + rawIngredientStore + recipePool + integrationStore), 'Tenant local stores must not hydrate unscoped legacy localStorage keys');
assert(!/window\.localStorage\.getItem\(LOCAL_PRODUCT_CATEGORY_STORAGE_KEY\)/.test(productPage), 'Product category cache must not hydrate unscoped legacy localStorage keys');

assert(/if \(!session\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\)/.test(authMe), 'auth/me must return unauthenticated without a tenant object when no session exists');
assert(/clearSessionCookie\(NextResponse\.json\(\{ ok: false \}/.test(authMe), 'auth/me must clear invalid session cookies instead of returning a fallback tenant');
assert(!/tenant:\s*\{/.test(authMe), 'auth/me response must not return a separate fallback tenant object');

assert(/isProtectedRoute && \(!isFetched \|\| isFetching \|\| !data\?\.ok \|\| !ready\)/.test(provider), 'Protected routes must stay gated until auth and runtime are ready');
assert(provider.includes('if (!isFetched || isFetching) return;'), 'Runtime bootstrap must wait for auth refetch to finish');

assert(/runtime snapshot rejected for tenant mismatch/.test(runtimeState), 'Runtime snapshots must reject tenant identity drift');
assert(/findForeignTenantIds/.test(runtimeState), 'Runtime snapshots must inspect tenant ids before hydrate');
assert(/tenant-drift/.test(runtimeState), 'Tenant drift rejection must be visible in logs');

assert(/const DEFAULT_TENANTS: TenantRecord\[\] = \[\];/.test(saasStore), 'SaaS store must not seed a default demo tenant');
assert(/const DEFAULT_TENANT_CREDENTIALS: TenantCredential\[\] = \[\];/.test(saasStore), 'SaaS store must not seed demo credentials');
assert(/return `TNT-\$\{random\}`;/.test(saasStore), 'New generated tenant ids should use the production tenant prefix');
assert(/tenants: \[\]/.test(systemAdminStore), 'System Admin local fallback state must start with no demo tenants');

if (failures.length > 0) {
  console.error('[tenant-identity-drift] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[tenant-identity-drift] PASS');
