import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const legacyDemoTenantMarker = ['ABN', '48291'].join('-');

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function walk(dir, options = {}, files = []) {
  const absoluteDir = absolute(dir);
  if (!fs.existsSync(absoluteDir)) return files;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.turbo', '.cache'].includes(entry.name)) continue;
    if (!options.includeNext && entry.name === '.next') continue;
    const relativePath = path.relative(root, path.join(absoluteDir, entry.name)).replaceAll('\\', '/');
    if (entry.isDirectory()) {
      walk(relativePath, options, files);
      continue;
    }
    if (!options.extensions || options.extensions.some((extension) => entry.name.endsWith(extension))) {
      files.push(relativePath);
    }
  }

  return files;
}

function filesWithText(files, pattern) {
  return files.filter((file) => pattern.test(read(file)));
}

const productionSourceFiles = [
  ...walk('app', { extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] }),
  ...walk('components', { extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] }),
  ...walk('lib', { extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] }),
  'middleware.ts',
  'agent.js',
].filter(exists);

const browserSourceFiles = [
  ...walk('app', { extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
  ...walk('components', { extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
  ...walk('lib', { extensions: ['.ts', '.tsx', '.js', '.jsx'] }),
].filter(exists);

const builtClientChunks = exists('.next/static')
  ? walk('.next/static', { includeNext: true, extensions: ['.js'] })
  : [];

assert(
  filesWithText(productionSourceFiles, new RegExp(legacyDemoTenantMarker)).length === 0,
  'Production source must not contain the legacy demo tenant id.',
);
assert(
  filesWithText(builtClientChunks, new RegExp(legacyDemoTenantMarker)).length === 0,
  'Built browser chunks must not contain the legacy demo tenant id.',
);
assert(
  filesWithText(browserSourceFiles, /http:\/\/(?:127\.0\.0\.1|localhost):3001/).length === 0,
  'Browser source must not contain direct localhost:3001 bridge URLs.',
);
assert(
  filesWithText(builtClientChunks, /http:\/\/(?:127\.0\.0\.1|localhost):3001/).length === 0,
  'Built browser chunks must not contain direct localhost:3001 bridge URLs.',
);

const tenantCleanStart = read('lib/tenant-clean-start.ts');
assert(/NEXT_PUBLIC_ENABLE_SEED_BUSINESS_DATA === '1'/.test(tenantCleanStart), 'Seed business data must require an explicit public flag.');
assert(/NEXT_PUBLIC_SEED_TENANT_ID/.test(tenantCleanStart), 'Seed business data must require an explicit seed tenant id.');
assert(!/DEFAULT_SEED_TENANT_ID/.test(tenantCleanStart), 'Seed business data must not use a hardcoded tenant default.');

const saasStore = read('lib/saas-store.ts');
const systemAdminStore = read('lib/system-admin-store.ts');
assert(/const DEFAULT_TENANTS: TenantRecord\[\] = \[\];/.test(saasStore), 'SaaS local fallback must start with an empty tenant list.');
assert(/const DEFAULT_TENANT_CREDENTIALS: TenantCredential\[\] = \[\];/.test(saasStore), 'SaaS local fallback must not seed demo credentials.');
assert(/tenants: \[\]/.test(systemAdminStore), 'System Admin local fallback must start with no demo tenants.');

const seed = read('prisma/seed.mjs');
assert(/ALLOW_DEMO_SEED !== '1'/.test(seed), 'Prisma seed must require ALLOW_DEMO_SEED=1.');
assert(/NODE_ENV === 'production'/.test(seed), 'Prisma seed must be blocked in production.');
assert(/SEED_TENANT_ID is required/.test(seed), 'Prisma seed must require an explicit tenant id.');

const deployScripts = [
  ...walk('deploy/scripts', { extensions: ['.sh', '.mjs', '.js', '.ts', '.ps1'] }),
  'deploy-production.sh',
].filter(exists);
assert(
  filesWithText(deployScripts, /prisma\s+db\s+seed|npm\s+run\s+db:seed|BOOTSTRAP_TENANT_ID="\$\{BOOTSTRAP_TENANT_ID:-[^}]+\}"/).length === 0,
  'Deploy scripts must not seed demo data or invent a default bootstrap tenant.',
);

const provisioning = read('lib/system-admin/provisioning.ts');
const forbiddenProvisioningCreates = [
  'product.create',
  'productCategory.create',
  'recipe.create',
  'rawMaterial.create',
  'stockMovement.create',
  'cashMovement.create',
  'cashRegister.create',
  'customer.create',
  'supplier.create',
  'report.create',
  'printer.create',
  'runtimeState.create',
  'order.create',
  'payment.create',
  'tenantPrintJob.create',
  'tenantDeviceRegistry.create',
];
for (const call of forbiddenProvisioningCreates) {
  assert(!provisioning.includes(call), `Tenant provisioning must not create business/demo data through ${call}.`);
}

const runtimeState = read('lib/client/runtime-state.ts');
assert(/findForeignTenantIds/.test(runtimeState), 'Runtime snapshots must inspect embedded tenant ids before hydrate.');
assert(/runtime snapshot rejected for tenant mismatch/.test(runtimeState), 'Runtime snapshots must reject mismatched tenant identity.');

const tenantScopedStores = [
  'lib/table-layout-store.ts',
  'lib/sale-product-catalog.ts',
  'lib/raw-ingredient-store.ts',
  'lib/recipe-pool.ts',
  'lib/integration-store.ts',
  'app/products/page.tsx',
].filter(exists);
assert(
  filesWithText(tenantScopedStores, /localStorage\.getItem\(LOCAL_STORAGE_KEY\)|localStorage\.getItem\(LOCAL_PRODUCT_CATEGORY_STORAGE_KEY\)/).length === 0,
  'Tenant stores must not hydrate unscoped legacy localStorage keys.',
);

const authMe = read('app/api/auth/me/route.ts');
assert(/if \(!session\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\)/.test(authMe), 'auth/me must reject unauthenticated requests without returning a tenant.');
assert(!/tenant:\s*\{/.test(authMe), 'auth/me must not include a fallback tenant object.');

const appRuntimeProvider = read('components/providers/app-runtime-provider.tsx');
assert(/isProtectedRoute && \(!isFetched \|\| isFetching \|\| !data\?\.ok \|\| !ready\)/.test(appRuntimeProvider), 'Protected app screens must stay closed until auth refresh and runtime bootstrap finish.');
assert(appRuntimeProvider.includes('if (!isFetched || isFetching) return;'), 'Runtime bootstrap must wait for the fresh auth response.');

const kdsLocal = read('lib/server/kds-local.ts');
assert(!/Masa\s+\d+|Truffle Burger|Caffe Latte|tenant_id:\s*['"]demo['"]/.test(kdsLocal), 'KDS local fallback must not ship demo tickets or demo tenant identity.');
assert(/tickets:\s*\[\]/.test(kdsLocal), 'KDS local fallback must return an empty tenant-scoped ticket list.');

if (failures.length > 0) {
  console.error('[demo-purity] FAIL');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[demo-purity] PASS');
