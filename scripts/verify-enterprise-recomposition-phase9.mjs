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

const requiredDocs = [
  'AI_OPERATIONS_ARCHITECTURE.md',
  'SELF_HEALING_GOVERNANCE.md',
  'ANOMALY_DETECTION_FORENSICS.md',
  'AUTONOMOUS_RUNTIME_DIAGNOSTICS.md',
  'OPERATIONAL_HEALTH_SCORING.md',
  'SAFE_RECOVERY_BOUNDARIES.md',
  'AI_DEPLOYMENT_GOVERNANCE.md',
  'TELEMETRY_AGGREGATION_TOPOLOGY.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 9 AI operations document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase9-validate']), 'Missing package script: recomposition:phase9-validate');

const aiOps = read('lib/ai-operations/governance.ts');
assert(/buildAiOperationsSnapshot/.test(aiOps), 'AI operations layer must expose buildAiOperationsSnapshot');
assert(/buildAiOperationalScore/.test(aiOps), 'AI operations layer must expose operational scoring');
assert(/buildAiOperationalRecommendations/.test(aiOps), 'AI operations layer must expose recommendation engine');
assert(/getSafeRecoveryBoundaries/.test(aiOps), 'AI operations layer must expose safe recovery boundaries');
assert(/getForbiddenRecoveryBoundaries/.test(aiOps), 'AI operations layer must expose forbidden recovery boundaries');
assert(/deployAutomationAllowed:\s*false/.test(aiOps), 'AI governance must forbid automatic deploys');
assert(/destructiveRecoveryAllowed:\s*false/.test(aiOps), 'AI governance must forbid destructive recovery');
assert(/mutate production business data/.test(aiOps), 'Forbidden recovery must include business data mutation');
assert(/perform destructive migrations/.test(aiOps), 'Forbidden recovery must include destructive migrations');
assert(/delete tenant records/.test(aiOps), 'Forbidden recovery must include tenant deletion');
assert(/alter billing state/.test(aiOps), 'Forbidden recovery must include billing changes');
assert(/bypass tenant isolation/.test(aiOps), 'Forbidden recovery must include tenant isolation bypass');
assert(/deploy automatically/.test(aiOps), 'Forbidden recovery must include automatic deploys');
assert(/stale snapshot invalidation/.test(aiOps), 'Safe recovery must include stale snapshot invalidation');
assert(/websocket reconnect throttling/.test(aiOps), 'Safe recovery must include websocket reconnect throttling');
assert(/bounded retry orchestration/.test(aiOps), 'Safe recovery must include bounded retry orchestration');
assert(/telemetryAggregation/.test(aiOps), 'AI operations must define telemetry aggregation');
assert(/runtimeMetrics:\s*true/.test(aiOps), 'Telemetry aggregation must include runtime metrics');
assert(/websocketMetrics:\s*true/.test(aiOps), 'Telemetry aggregation must include websocket metrics');
assert(/queueMetrics:\s*true/.test(aiOps), 'Telemetry aggregation must include queue metrics');
assert(/tenantHealthMetrics:\s*true/.test(aiOps), 'Telemetry aggregation must include tenant health metrics');
assert(/mutationLifecycleMetrics:\s*true/.test(aiOps), 'Telemetry aggregation must include mutation lifecycle metrics');

const anomaly = read('lib/anomaly/detector.ts');
assert(/getAnomalyStats/.test(anomaly), 'Anomaly detection must expose anomaly stats');
assert(/detectWebsocketAnomaly/.test(anomaly), 'Anomaly detection must include websocket storm detection');
assert(/detectSyncFailureAnomaly/.test(anomaly), 'Anomaly detection must include sync/reconciliation anomaly detection');
assert(/detectTrafficAnomaly/.test(anomaly), 'Anomaly detection must include tenant traffic anomaly detection');

const observabilityRoute = read('app/api/system-admin/observability/route.ts');
assert(/buildAiOperationsSnapshot/.test(observabilityRoute), 'System-admin observability must expose AI operations snapshot');
assert(/aiOperations/.test(observabilityRoute), 'System-admin observability response must include aiOperations');

const enterpriseTelemetry = read('lib/observability/enterprise-telemetry.ts');
assert(/buildEnterpriseTelemetrySnapshot/.test(enterpriseTelemetry), 'AI operations must build on centralized enterprise telemetry');

const selfHealing = read('lib/self-healing/engine.ts');
assert(/triggerWebSocketReconnect/.test(selfHealing), 'Self-healing must retain websocket recovery trigger');
assert(/triggerSyncQueueRecovery/.test(selfHealing), 'Self-healing must retain sync queue recovery trigger');
assert(/memory_leak_mitigation/.test(selfHealing), 'Self-healing must retain memory mitigation signal');

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const phrase of [
  'AI must remain bounded, observable, auditable, and deterministic',
  'AI MUST NEVER mutate production business data',
  'AI MUST NEVER deploy automatically',
  'No rewrite is introduced in Phase 9',
  'Centralized AI governance',
  'Safe auto-recovery is limited to runtime cleanup and bounded orchestration',
]) {
  assert(docsText.includes(phrase), `Phase 9 docs must include rule: ${phrase}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-9-ai-operations-self-healing-platform-governance',
  diagnostics: {
    aiOperations: Boolean(aiOps),
    anomalyDetection: /getAnomalyStats/.test(anomaly),
    operationalScoring: /buildAiOperationalScore/.test(aiOps),
    boundedRecovery: /getSafeRecoveryBoundaries/.test(aiOps) && /getForbiddenRecoveryBoundaries/.test(aiOps),
    observabilityDashboard: /aiOperations/.test(observabilityRoute),
  },
  warnings,
  failures,
};

if (warnings.length === 0 && !packageJson.scripts?.['release:simulate-autonomous-chaos']) {
  warn('Autonomous chaos simulation script is absent or renamed.');
}

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
