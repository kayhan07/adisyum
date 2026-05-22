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

const requiredDocs = [
  'ENTERPRISE_OBSERVABILITY_ARCHITECTURE.md',
  'RUNTIME_RECOVERY_RULES.md',
  'DEPLOYMENT_RECOVERY_PLAN.md',
  'PRODUCTION_HEALTH_TOPOLOGY.md',
  'WEBSOCKET_RECOVERY_FORENSICS.md',
  'RUNTIME_TELEMETRY_CONTRACTS.md',
  'DEPLOYMENT_DRIFT_FORENSICS.md',
  'CLIENT_RUNTIME_RECOVERY.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 7 hardening document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase7-validate']), 'Missing package script: recomposition:phase7-validate');

const enterpriseTelemetry = read('lib/observability/enterprise-telemetry.ts');
assert(/recordEnterpriseTelemetry/.test(enterpriseTelemetry), 'Enterprise telemetry must expose recordEnterpriseTelemetry');
assert(/buildEnterpriseTelemetrySnapshot/.test(enterpriseTelemetry), 'Enterprise telemetry must expose buildEnterpriseTelemetrySnapshot');
assert(/buildRuntimeTelemetrySnapshot/.test(enterpriseTelemetry), 'Enterprise telemetry must expose runtime telemetry snapshot');
assert(/buildDeploymentTelemetrySnapshot/.test(enterpriseTelemetry), 'Enterprise telemetry must expose deployment telemetry snapshot');
assert(/buildClientRuntimeTelemetrySnapshot/.test(enterpriseTelemetry), 'Enterprise telemetry must expose client runtime telemetry snapshot');
assert(/getEnterpriseRecoveryContracts/.test(enterpriseTelemetry), 'Enterprise telemetry must expose recovery contracts');
assert(/recordStructuredLog/.test(enterpriseTelemetry), 'Enterprise telemetry must centralize production diagnostics through metrics-store');
assert(/runtimeBuildIdEndpoint:\s*'\/api\/runtime-build-id'/.test(enterpriseTelemetry), 'Deployment telemetry must include runtime-build-id integrity');
assert(/PM2_RESTART_COUNT/.test(enterpriseTelemetry), 'Runtime telemetry must include PM2 restart ownership');
assert(/nginxOwnership/.test(enterpriseTelemetry), 'Deployment telemetry must include nginx ownership');
assert(/websocket-sync-recovery/.test(enterpriseTelemetry), 'Recovery contracts must include websocket recovery');
assert(/client-persistence-recovery/.test(enterpriseTelemetry), 'Recovery contracts must include persistence recovery');
assert(/optimistic-queue-recovery/.test(enterpriseTelemetry), 'Recovery contracts must include optimistic queue recovery');

const buildIdRoute = read('app/api/runtime-build-id/route.ts');
assert(/pm2RestartCount/.test(buildIdRoute), 'runtime-build-id must expose PM2 restart count');
assert(/runtimeAuthority/.test(buildIdRoute), 'runtime-build-id must expose canonical runtime authority');
assert(/apiNamespaceOwner/.test(buildIdRoute), 'runtime-build-id must expose API namespace owner');
assert(/sessionCookieDomain/.test(buildIdRoute), 'runtime-build-id must expose session cookie domain for auth drift checks');

const observabilityRoute = read('app/api/system-admin/observability/route.ts');
assert(/buildEnterpriseTelemetrySnapshot/.test(observabilityRoute), 'System admin observability must include enterprise telemetry snapshot');
assert(/enterpriseTelemetry/.test(observabilityRoute), 'System admin observability response must expose enterpriseTelemetry');

const selfHealing = read('lib/self-healing/engine.ts');
for (const token of [
  'pm2_restart_detected',
  'memory_leak_mitigation',
  'zombie_connection_cleanup',
  'triggerSyncQueueRecovery',
  'triggerWebSocketReconnect',
  'getHealingStats',
]) {
  assert(selfHealing.includes(token), `Self-healing engine must expose recovery signal: ${token}`);
}

const runtimeDiagnostics = [
  ['lib/pos-runtime/runtime-event-bus.ts', 'getRuntimeEventBusDiagnostics'],
  ['lib/pos-runtime/runtime-persistence-engine.ts', 'getRuntimePersistenceDiagnostics'],
  ['lib/pos-runtime/runtime-sync-engine.ts', 'getRuntimeSyncDiagnostics'],
  ['lib/pos-runtime/order-mutations.ts', 'getOrderMutationRuntimeDiagnostics'],
];

for (const [file, token] of runtimeDiagnostics) {
  assert(read(file).includes(token), `Client runtime diagnostics missing ${token} in ${file}`);
}

const deployVerifier = read('scripts/verify-deploy-runtime.mjs');
assert(/runtime-build-id/.test(deployVerifier), 'deploy verifier must check runtime-build-id');
assert(/api\/pos\/table-orders/.test(deployVerifier), 'deploy verifier must check POS API route ownership');

const reconstruct = read('deploy/scripts/reconstruct-vps-runtime.sh');
assert(/runtime-build-id/.test(reconstruct), 'reconstruct script must validate runtime-build-id');
assert(/pm2 jlist/.test(reconstruct), 'reconstruct script must validate PM2 ownership');
assert(/nginx -T/.test(reconstruct), 'reconstruct script must validate nginx ownership');
assert(/api\/pos\/table-orders/.test(reconstruct), 'reconstruct script must validate POS API route ownership');

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const phrase of [
  'Every runtime failure must become observable',
  'Every deploy must become verifiable',
  'Every runtime crash must become recoverable',
  'Centralized telemetry ownership',
  'No rewrite is introduced in Phase 7',
]) {
  assert(docsText.includes(phrase), `Phase 7 docs must include rule: ${phrase}`);
}

const sourceFiles = walk('app').concat(walk('components'), walk('lib')).filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const directTelemetryEmitters = sourceFiles.filter((file) => {
  if (file === 'lib/observability/enterprise-telemetry.ts') return false;
  const content = read(file);
  return /recordEnterpriseTelemetry\(/.test(content);
});
if (directTelemetryEmitters.length > 0) {
  warn(`Enterprise telemetry emitters outside canonical layer require ownership review: ${directTelemetryEmitters.join(', ')}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-7-enterprise-hardening-production-observability',
  diagnostics: {
    enterpriseTelemetry: Boolean(enterpriseTelemetry),
    runtimeBuildIdentity: /runtimeAuthority/.test(buildIdRoute),
    observabilityDashboard: /enterpriseTelemetry/.test(observabilityRoute),
    recoveryContracts: /getEnterpriseRecoveryContracts/.test(enterpriseTelemetry),
  },
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
