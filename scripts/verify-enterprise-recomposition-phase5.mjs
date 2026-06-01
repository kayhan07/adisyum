import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
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

function warn(message) {
  warnings.push(message);
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

function filesContaining(files, pattern) {
  return files.filter((file) => pattern.test(read(file)));
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

const requiredDocs = [
  'LEGACY_RUNTIME_REMOVAL_REPORT.md',
  'LEGACY_ROUTE_REMOVAL_MAP.md',
  'LEGACY_API_DEPRECATION_MAP.md',
  'LEGACY_PROVIDER_FORENSICS.md',
  'LEGACY_ENVIRONMENT_DEBT.md',
  'LEGACY_DEPLOYMENT_DEBT.md',
  'LEGACY_DATABASE_DEBT.md',
  'SAFE_REMOVAL_EXECUTION_PLAN.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 5 legacy forensics document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase5-validate']), 'Missing package script: recomposition:phase5-validate');

assert(!exists('app/orders/demo/page.tsx'), 'Demo-era route app/orders/demo must stay removed');
assert(exists('app/adisyonsistemi/page.tsx'), 'Legacy /adisyonsistemi compatibility redirect must remain until external traffic drains');
assert(/permanentRedirect\(['"]\/app['"]\)/.test(read('app/adisyonsistemi/page.tsx')), '/adisyonsistemi must permanently redirect to /app, not own runtime');

const appFiles = walk('app').filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const componentFiles = walk('components').filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const libFiles = walk('lib').filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const deployFiles = walk('deploy').filter((file) => /\.(sh|mjs|md|conf|yml|yaml|url)$/.test(file));
const scriptFiles = walk('scripts').filter((file) => /\.(ts|mjs|js|sh)$/.test(file));

const applicationFiles = appFiles.concat(componentFiles, libFiles);

const unexpectedAdisyonRefs = filesContaining(applicationFiles, /adisyonsistemi/)
  .filter((file) => ![
    'app/adisyonsistemi/page.tsx',
    'lib/runtime/runtime-api.ts',
  ].includes(file));
assert(
  unexpectedAdisyonRefs.length === 0,
  `Unexpected application references to legacy adisyonsistemi route: ${unexpectedAdisyonRefs.join(', ')}`,
);

const runtimeApi = read('lib/runtime/runtime-api.ts');
assert(/adisyonsistemi\/api/.test(runtimeApi), 'runtime-api must continue rejecting /adisyonsistemi/api leakage');
assert(/\/app\/api/.test(runtimeApi), 'runtime-api must continue rejecting /app/api leakage');

const backendAuth = read('lib/server/backend-auth.ts');
assert(!/127\.0\.0\.1:8000|demo-bistro|admin@aurelia\.local|DEFAULT_API_URL|DEFAULT_TENANT_KEY/.test(backendAuth), 'backend-auth must not carry demo/localhost backend fallbacks');
assert(/AURELIA_API_URL is required/.test(backendAuth), 'backend-auth must fail explicitly when AURELIA_API_URL is missing');
assert(/AURELIA_TENANT_KEY is required/.test(backendAuth), 'backend-auth must fail explicitly when AURELIA_TENANT_KEY is missing');

const legacyPrefixedApis = filesContaining(applicationFiles, /\/adisyonsistemi\/api|\/app\/api/)
  .filter((file) => file !== 'lib/runtime/runtime-api.ts');
assert(legacyPrefixedApis.length === 0, `Legacy-prefixed API calls found: ${legacyPrefixedApis.join(', ')}`);

const runtimeEventEmitters = filesContaining(applicationFiles, /emitRuntimeEvent\(/)
  .filter((file) => ![
    'lib/pos-runtime/runtime-event-bus.ts',
    'lib/pos-runtime/runtime-persistence-engine.ts',
    'lib/runtime/runtime-session-engine.ts',
    'lib/device-runtime/device-session-registry.ts',
  ].includes(file));
assert(runtimeEventEmitters.length === 0, `Runtime event emission ownership drift: ${runtimeEventEmitters.join(', ')}`);

const directRuntimeStorageWriters = filesContaining(
  appFiles.concat(componentFiles),
  /window\.localStorage\.setItem\(|window\.sessionStorage\.setItem\(/,
).filter((file) => ![
  'app/layout.tsx',
  'components/theme-toggle.tsx',
  'components/providers/app-runtime-provider.tsx',
].includes(file));
assert(
  directRuntimeStorageWriters.length === 0,
  `UI runtime storage write ownership drift: ${directRuntimeStorageWriters.join(', ')}`,
);

const ecosystem = read('ecosystem.config.cjs');
const pm2Names = [...ecosystem.matchAll(/name:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]).sort();
assert(pm2Names.join(',') === 'adisyum-root-app,adisyum-website,adisyum-worker', `PM2 ownership drift: ${pm2Names.join(',') || '(none)'}`);
assert(!/adisyum-pos-app|adisyum-system-admin|adisyonsistemi/i.test(ecosystem), 'PM2 must not define legacy app owners');

const nginx = read('deploy/nginx/adisyum.conf');
const legacyExact = nginxLocationBlock(nginx, /location\s+=\s+\/adisyonsistemi\s*\{/);
const legacyPrefix = nginxLocationBlock(nginx, /location\s+\^~\s+\/adisyonsistemi\/\s*\{/);
assert(/return\s+308\s+\/app;/.test(legacyExact), 'Nginx must redirect exact /adisyonsistemi to /app');
assert(/return\s+308\s+\/app;/.test(legacyPrefix), 'Nginx must redirect /adisyonsistemi/* to /app');
assert(!/proxy_pass\s+http:\/\/127\.0\.0\.1:/.test(`${legacyExact}\n${legacyPrefix}`), 'Nginx legacy adisyonsistemi blocks must not proxy to a runtime');

const obsoleteDeploymentCandidates = [
  'deploy/scripts/fix-apache-nginx-production.sh',
  'deploy/scripts/check-production.sh',
];
for (const file of obsoleteDeploymentCandidates) {
  if (exists(file)) warn(`${file} remains as migration-required deployment debt; canonical deploy owner is reconstruct-vps-runtime.sh`);
}

if (exists('app/api/pos/test/route.ts')) {
  warn('app/api/pos/test/route.ts remains as diagnostics API used by POS settings; preserve until renamed under diagnostics namespace');
}

const seed = read('prisma/seed.mjs');
if (new RegExp(`${['ABN', '48291'].join('-')}|status:\\s*['"]demo['"]`).test(seed)) {
  warn('prisma/seed.mjs still contains demo seed defaults; Phase 4/5 classify this as migration-required seed debt');
}

const loopbackApplicationRefs = filesContaining(applicationFiles, /http:\/\/127\.0\.0\.1|http:\/\/localhost/)
  .filter((file) => ![
    'lib/local-agent.ts',
    'app/api/printers/local-agent/route.ts',
    'app/api/printers/local-agent/print/route.ts',
    'lib/commercial-ops/platform.ts',
  ].includes(file));
assert(loopbackApplicationRefs.length === 0, `Application code contains unauthorized loopback URL defaults: ${loopbackApplicationRefs.join(', ')}`);

const loopbackDeployRefs = filesContaining(deployFiles.concat(scriptFiles), /127\.0\.0\.1|localhost/);
const undocumentedLoopbackDeployRefs = loopbackDeployRefs.filter((file) => ![
  'deploy/nginx/adisyum.conf',
  'deploy/nginx/staging.conf',
  'deploy/scripts/reconstruct-vps-runtime.sh',
  'deploy/scripts/fix-apache-nginx-production.sh',
  'deploy/scripts/diagnose-postgres-auth.sh',
  'deploy/windows/shortcuts/Adisyum Tray.url',
  'deploy/ADISYUM_DESKTOP_OPERATING_ENVIRONMENT.md',
  'deploy/LIVE_ROUTING_FIX_REPORT.md',
  'deploy/README-production.md',
  'deploy/prometheus/staging.yml',
  'scripts/db-test-connection.mjs',
  'scripts/db-inspect-env.mjs',
].includes(file));
if (undocumentedLoopbackDeployRefs.length > 0) {
  warn(`Loopback references remain outside runtime app and need classification: ${undocumentedLoopbackDeployRefs.join(', ')}`);
}

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const phrase of [
  'Safe to remove',
  'Migration required',
  'Preserve for compatibility',
  'Critical - do not remove',
  'No destructive migration is introduced in Phase 5',
]) {
  assert(docsText.includes(phrase), `Phase 5 docs must include classification phrase: ${phrase}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-5-legacy-removal-debt-elimination',
  removed: ['app/orders/demo/page.tsx'],
  preservedCompatibility: ['app/adisyonsistemi/page.tsx', 'app/api/pos/test/route.ts'],
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
