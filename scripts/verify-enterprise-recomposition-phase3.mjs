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

const requiredDocs = [
  'SESSION_OWNERSHIP_RULES.md',
  'TENANT_RUNTIME_PROPAGATION.md',
  'DEVICE_RUNTIME_OWNERSHIP.md',
  'API_NAMESPACE_OWNERSHIP.md',
  'AUTH_PROPAGATION_FORENSICS.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 3 ownership document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase3-validate']), 'Missing package script: recomposition:phase3-validate');

const sourceFiles = walk('app')
  .concat(walk('components'))
  .concat(walk('lib'))
  .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));

const runtimeApi = read('lib/runtime/runtime-api.ts');
assert(/export function buildApiUrl/.test(runtimeApi), 'runtime-api must export buildApiUrl');
assert(/export function runtimeFetch/.test(runtimeApi), 'runtime-api must export runtimeFetch');
assert(/credentials:\s*init\.credentials\s*\?\?\s*['"]include['"]/.test(runtimeApi), 'runtimeFetch must include credentials by default');
assert(/adisyonsistemi\/api/.test(runtimeApi) && /\/app\/api/.test(runtimeApi), 'runtime-api must reject legacy-prefixed API namespaces');

const criticalApiFiles = [
  'components/order-composer.tsx',
  'components/providers/app-runtime-provider.tsx',
  'lib/client/runtime-state.ts',
  'lib/client/secure-logout.ts',
  'lib/local-agent.ts',
  'lib/offline-sync-store.ts',
  'lib/query/auth.ts',
  'lib/query/tenant.ts',
  'lib/use-product-mapping-validation.ts',
  'lib/pos-runtime/order-mutations.ts',
  'lib/pos-runtime/runtime-sync-engine.ts',
];

const criticalDirectFetch = criticalApiFiles.filter((file) => {
  const text = read(file);
  return /fetch\(\s*['"`]\/api|fetch\(\s*`\/api|fetch\(\s*proxyRoute/.test(text);
});
assert(
  criticalDirectFetch.length === 0,
  `Critical runtime API calls must use runtimeFetch/buildApiUrl: ${criticalDirectFetch.join(', ')}`,
);

const legacyApiLeakFiles = filesContaining(sourceFiles, /\/adisyonsistemi\/api|\/app\/api/)
  .filter((file) => file !== 'lib/runtime/runtime-api.ts');
assert(
  legacyApiLeakFiles.length === 0,
  `Legacy-prefixed API namespace leakage found: ${legacyApiLeakFiles.join(', ')}`,
);

const clientApiFetchDebt = filesContaining(
  sourceFiles.filter((file) => !file.startsWith('app/api/') && !file.startsWith('lib/server/')),
  /fetch\(\s*['"`]\/api|fetch\(\s*`\/api/,
).filter((file) => !criticalApiFiles.includes(file));
if (clientApiFetchDebt.length > 0) {
  warn(`Non-runtime feature clients still have direct /api fetch debt: ${clientApiFetchDebt.join(', ')}`);
}

const sessionEngine = read('lib/runtime/runtime-session-engine.ts');
assert(/hydrateRuntimeSessionContext/.test(sessionEngine), 'runtime-session-engine must resolve runtime session context');
assert(/propagateRuntimeSessionAuth/.test(sessionEngine), 'runtime-session-engine must own client auth propagation');
assert(/authorizeBridgeRuntimeSession/.test(sessionEngine), 'runtime-session-engine must own bridge auth validation');

const provider = read('components/providers/app-runtime-provider.tsx');
assert(/propagateRuntimeSessionAuth/.test(provider), 'AppRuntimeProvider must propagate auth through runtime-session-engine');
assert(!/hydrateSessionStateFromAuth/.test(provider), 'AppRuntimeProvider must not directly hydrate session-store auth');
assert(/runtimeFetch\('\/api\/auth\/me'/.test(provider), 'AppRuntimeProvider auth refresh must use runtimeFetch');
assert(/runtimeFetch\('\/api\/runtime\/heartbeat'/.test(provider), 'AppRuntimeProvider heartbeat must use runtimeFetch');

const tenantContext = read('lib/runtime/tenant-runtime-context.ts');
assert(/resolveTenantRuntimeScope/.test(tenantContext), 'tenant-runtime-context must own tenant scope resolution');
assert(/resolveBranchRuntimeScope/.test(tenantContext), 'tenant-runtime-context must own branch scope resolution');

const runtimeCoreTenantDriftFiles = [
  'components/order-composer.tsx',
  'components/providers/app-runtime-provider.tsx',
  'lib/runtime/runtime-session-engine.ts',
  'lib/runtime/tenant-runtime-context.ts',
  'lib/device-runtime/device-session-registry.ts',
  'lib/pos-runtime/order-mutations.ts',
  'lib/pos-runtime/runtime-sync-engine.ts',
].filter((file) => /tenantId\s*[:=]\s*['"]|activeBranchId\s*[:=]\s*['"]|demo-tenant|localhost tenant/i.test(read(file)));
assert(
  runtimeCoreTenantDriftFiles.length === 0,
  `Runtime core must not contain hardcoded tenant/branch assumptions: ${runtimeCoreTenantDriftFiles.join(', ')}`,
);

const deviceRegistry = read('lib/device-runtime/device-session-registry.ts');
assert(/resolveRuntimeDeviceId/.test(deviceRegistry), 'device-session-registry must own runtime device id');
assert(/registerRuntimeDevices/.test(deviceRegistry), 'device-session-registry must own device registration projection');
assert(/resolveRuntimePrinterRoute/.test(deviceRegistry), 'device-session-registry must own printer route resolution');
assert(/authorizeDeviceHandshake/.test(deviceRegistry), 'device-session-registry must own device handshake authorization');
assert(/fetchLocalAgentJson/.test(deviceRegistry), 'device-session-registry must own bridge printer calls');
assert(/resolveRuntimeDeviceId/.test(provider), 'AppRuntimeProvider must resolve device identity through device-session-registry');
assert(!/localStorage\.getItem\(['"]adisyum-runtime-device-id/.test(provider), 'AppRuntimeProvider must not own device id localStorage');

const localAgent = read('lib/local-agent.ts');
assert(/runtimeFetch\(proxyRoute/.test(localAgent), 'local-agent proxy calls must use runtimeFetch');
assert(/isLocalBridgeBrowserRuntimeEnabled/.test(localAgent), 'local-agent must gate localhost bridge calls behind desktop/explicit runtime detection');

const directCookieReaders = filesContaining(sourceFiles.filter((file) => !file.startsWith('app/api/')), /document\.cookie/);
assert(directCookieReaders.length === 0, `Client code must not read cookies directly: ${directCookieReaders.join(', ')}`);

const sessionCookieDomainFiles = filesContaining(sourceFiles, /SESSION_COOKIE_DOMAIN/);
assert(
  sessionCookieDomainFiles.every((file) => ['lib/session.ts', 'app/api/runtime-build-id/route.ts'].includes(file)),
  `SESSION_COOKIE_DOMAIN ownership drift: ${sessionCookieDomainFiles.join(', ')}`,
);

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-3-api-session-tenant-device-consolidation',
  ownership: {
    criticalApiFiles,
    clientApiFetchDebt,
    sessionCookieDomainFiles,
  },
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
