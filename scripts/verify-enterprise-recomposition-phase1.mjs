import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredDocs = [
  'ENTERPRISE_RECOMPOSITION_PLAN.md',
  'CANONICAL_RUNTIME_TOPOLOGY.md',
  'DATABASE_OWNERSHIP_MAP.md',
  'DEPLOYMENT_AUTHORITY_MAP.md',
  'LEGACY_INFRASTRUCTURE_REMOVAL_PLAN.md',
  'TENANT_ISOLATION_VALIDATION.md',
];

const failures = [];
const warnings = [];

function read(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function walk(dir, matches = []) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return matches;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (['.git', '.next', 'node_modules'].includes(entry.name)) continue;
    const relative = path.join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) walk(relative, matches);
    else matches.push(relative);
  }
  return matches;
}

function nginxLocationBlock(config, pattern) {
  const match = pattern.exec(config);
  if (!match) return '';
  const start = match.index;
  let depth = 0;
  for (let index = start; index < config.length; index += 1) {
    if (config[index] === '{') depth += 1;
    if (config[index] === '}') {
      depth -= 1;
      if (depth === 0) return config.slice(start, index + 1);
    }
  }
  return config.slice(start);
}

for (const doc of requiredDocs) {
  assert(exists(doc), `Missing canonical recomposition document: ${doc}`);
}

const packageJson = JSON.parse(read('package.json') || '{}');
const scripts = packageJson.scripts ?? {};
for (const scriptName of ['routes:audit', 'runtime:audit-production', 'env:audit-production', 'deploy:verify-runtime']) {
  assert(Boolean(scripts[scriptName]), `Missing package script: ${scriptName}`);
}

const ecosystem = read('ecosystem.config.cjs');
const pm2Names = [...ecosystem.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
assert(
  pm2Names.join(',') === 'adisyum-root-app,adisyum-website,adisyum-worker',
  `PM2 ownership drift: expected adisyum-root-app,adisyum-website,adisyum-worker got ${pm2Names.join(',') || '(none)'}`,
);
assert(/script:\s*['"]\.next\/standalone\/server\.js['"]/.test(ecosystem), 'adisyum-root-app must run .next/standalone/server.js');
assert(/PORT:\s*['"]3000['"]/.test(ecosystem), 'adisyum-root-app must bind PORT=3000');
assert(/HOSTNAME:\s*['"]0\.0\.0\.0['"]/.test(ecosystem), 'adisyum-root-app must bind HOSTNAME=0.0.0.0');
assert(/args:\s*['"]start -p 3010['"]/.test(ecosystem), 'adisyum-website must own port 3010');

const nginx = read('deploy/nginx/adisyum.conf');
const apiExact = nginxLocationBlock(nginx, /location\s+=\s+\/api\s*\{/);
const apiPrefix = nginxLocationBlock(nginx, /location\s+\^~\s+\/api\/\s*\{/);
const appExact = nginxLocationBlock(nginx, /location\s+=\s+\/app\s*\{/);
const appPrefix = nginxLocationBlock(nginx, /location\s+\^~\s+\/app\/\s*\{/);
const adminExact = nginxLocationBlock(nginx, /location\s+=\s+\/system-admin\s*\{/);
const adminPrefix = nginxLocationBlock(nginx, /location\s+\^~\s+\/system-admin\/\s*\{/);
const legacyExact = nginxLocationBlock(nginx, /location\s+=\s+\/adisyonsistemi\s*\{/);
const legacyPrefix = nginxLocationBlock(nginx, /location\s+\^~\s+\/adisyonsistemi\/\s*\{/);
const rootLocation = nginxLocationBlock(nginx, /location\s+\/\s*\{/);

assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(apiExact), 'Nginx exact /api must proxy to root app 3000');
assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(apiPrefix), 'Nginx /api/* must proxy to root app 3000');
assert(!/proxy_pass\s+http:\/\/127\.0\.0\.1:3010;/.test(`${apiExact}\n${apiPrefix}`), 'Nginx /api must never proxy to website 3010');
assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(appExact), 'Nginx exact /app must proxy to root app 3000');
assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(appPrefix), 'Nginx /app/* must proxy to root app 3000');
assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(adminExact), 'Nginx exact /system-admin must proxy to root app 3000');
assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(adminPrefix), 'Nginx /system-admin/* must proxy to root app 3000');
assert(/return\s+308\s+\/app;/.test(legacyExact), 'Nginx exact /adisyonsistemi must redirect to /app');
assert(/return\s+308\s+\/app;/.test(legacyPrefix), 'Nginx /adisyonsistemi/* must redirect to /app');
assert(!/proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(`${legacyExact}\n${legacyPrefix}`), 'Legacy /adisyonsistemi must not proxy to root app');
assert(/proxy_pass\s+http:\/\/127\.0\.0\.1:3010;/.test(rootLocation), 'Nginx root / must proxy to website 3010');

const rootPage = read('app/page.tsx');
const legacyPage = read('app/adisyonsistemi/page.tsx');
assert(/redirect\(['"]\/app['"]\)/.test(rootPage), 'Root page must redirect to /app');
assert(/permanentRedirect\(['"]\/app['"]\)/.test(legacyPage), 'Legacy /adisyonsistemi page must permanently redirect to /app');

const runtimeApi = read('lib/runtime/runtime-api.ts');
assert(/POS_TABLE_ORDERS_API\s*=\s*['"]\/api\/pos\/table-orders['"]/.test(runtimeApi), 'runtime-api must own POS_TABLE_ORDERS_API');
assert(/adisyonsistemi\/api/.test(runtimeApi) && /\/app\/api/.test(runtimeApi), 'runtime-api must reject legacy-prefixed API paths');

const middleware = read('middleware.ts');
assert(/isLegacyAdisyonPath/.test(middleware), 'Middleware must explicitly canonicalize legacy /adisyonsistemi paths');
assert(/NextResponse\.redirect\(url,\s*308\)/.test(middleware), 'Middleware legacy canonicalization must use 308 redirects');
assert(!/url\.searchParams\.set\(['"]next['"]/.test(middleware), 'Middleware must not append next query chaining to auth redirects');
assert(/pathname === ['"]\/app['"][\s\S]*NextResponse\.next\(\)/.test(middleware), 'Canonical /app must render without self-redirect auth loops');

const sourceFiles = walk('app')
  .concat(walk('components'))
  .concat(walk('lib'))
  .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const forbiddenLegacyRefs = sourceFiles.filter((file) => {
  const text = read(file);
  if (!text.includes('adisyonsistemi')) return false;
  return ![
    'app/adisyonsistemi/page.tsx',
    'lib/runtime/runtime-api.ts',
  ].includes(file);
});
if (forbiddenLegacyRefs.length > 0) {
  fail(`Unexpected application references to adisyonsistemi: ${forbiddenLegacyRefs.join(', ')}`);
}

const reconstruct = read('deploy/scripts/reconstruct-vps-runtime.sh');
assert(/pm2 jlist/.test(reconstruct), 'reconstruct script must validate live PM2 ownership');
assert(/api\/pos\/table-orders/.test(reconstruct), 'reconstruct script must validate POS table-orders route');
assert(/runtime-build-id/.test(reconstruct), 'reconstruct script must validate runtime-build-id');
assert(/Legacy \/adisyonsistemi must redirect to \/app/.test(reconstruct), 'reconstruct script must reject legacy /adisyonsistemi runtime ownership');

const liveBase = process.env.PHASE1_LIVE_BASE_URL || '';
const verifyLive = process.env.PHASE1_VERIFY_LIVE === '1' || Boolean(liveBase);
let live = null;
if (verifyLive) {
  const base = (liveBase || 'https://adisyum.com').replace(/\/$/, '');
  live = {};
  try {
    const response = await fetch(`${base}/api/pos/table-orders`, { method: 'POST', cache: 'no-store' });
    const body = await response.json().catch(() => null);
    live.tableOrders = { status: response.status, body };
    if (response.status === 404) fail(`${base}/api/pos/table-orders returned 404`);
  } catch (error) {
    fail(`Live table-orders verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const response = await fetch(`${base}/api/runtime-build-id`, { cache: 'no-store' });
    const body = await response.json().catch(() => null);
    live.runtimeBuildId = { status: response.status, body };
    if (response.status === 404) fail(`${base}/api/runtime-build-id returned 404`);
  } catch (error) {
    fail(`Live runtime-build-id verification failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-1-infrastructure-consolidation',
  pm2Names,
  nginx: {
    apiToRoot: /proxy_pass\s+http:\/\/127\.0\.0\.1:3000;/.test(`${apiExact}\n${apiPrefix}`),
    apiToWebsite: /proxy_pass\s+http:\/\/127\.0\.0\.1:3010;/.test(`${apiExact}\n${apiPrefix}`),
    legacyRedirectsToApp: /return\s+308\s+\/app;/.test(legacyExact) && /return\s+308\s+\/app;/.test(legacyPrefix),
    rootToWebsite: /proxy_pass\s+http:\/\/127\.0\.0\.1:3010;/.test(rootLocation),
  },
  live,
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
