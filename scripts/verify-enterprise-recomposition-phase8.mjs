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
  'MULTI_TENANT_SCALE_ARCHITECTURE.md',
  'QUEUE_AND_WORKER_TOPOLOGY.md',
  'REALTIME_SCALABILITY_FORENSICS.md',
  'TENANT_OPERATIONS_GOVERNANCE.md',
  'DEPLOYMENT_SCALING_AND_ROLLBACK.md',
  'CACHE_OWNERSHIP_AND_INVALIDATION.md',
  'PRODUCTION_READINESS_CHECKLIST.md',
  'BACKGROUND_JOB_OWNERSHIP.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 8 scalability document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase8-validate']), 'Missing package script: recomposition:phase8-validate');

const scaleReadiness = read('lib/operations/scale-readiness.ts');
assert(/buildScaleReadinessSnapshot/.test(scaleReadiness), 'Scale readiness must expose buildScaleReadinessSnapshot');
assert(/getQueueOwnershipContracts/.test(scaleReadiness), 'Scale readiness must expose queue ownership contracts');
assert(/getWorkerOwnershipContracts/.test(scaleReadiness), 'Scale readiness must expose worker ownership contracts');
assert(/getTenantOperationContracts/.test(scaleReadiness), 'Scale readiness must expose tenant operation contracts');
assert(/getCacheSegmentationContracts/.test(scaleReadiness), 'Scale readiness must expose cache segmentation contracts');
assert(/getRealtimeScaleContracts/.test(scaleReadiness), 'Scale readiness must expose realtime scale contracts');
assert(/maxAttempts/.test(scaleReadiness), 'Queue contracts must define bounded retry rules');
assert(/deadLetter/.test(scaleReadiness), 'Queue contracts must define dead-letter rules');
assert(/tenantId and branchId required in cache key/.test(scaleReadiness), 'Cache contracts must include tenant/branch segmentation');
assert(/rollbackSafeDeployRequired/.test(scaleReadiness), 'Scale readiness must include rollback-safe deployment readiness');
assert(/adisyum-worker/.test(scaleReadiness), 'Worker contracts must include adisyum-worker ownership');
assert(/local POS agent/.test(scaleReadiness), 'Worker contracts must include local POS agent ownership');
assert(/one in-flight reconciliation per runtime scope/.test(scaleReadiness), 'Realtime scale contracts must bound reconciliation overlap');

const queueOrchestration = read('lib/queue/orchestration.ts');
assert(/ORCHESTRATION_QUEUES/.test(queueOrchestration), 'Queue orchestration must define canonical queues');
assert(/attempts:\s*5/.test(queueOrchestration), 'Queue orchestration must define bounded retry attempts');
assert(/backoff:\s*\{\s*type:\s*'exponential'/.test(queueOrchestration), 'Queue orchestration must define exponential backoff');
assert(/removeOnFail/.test(queueOrchestration), 'Queue orchestration must retain failed jobs for dead-letter review');
assert(/getDurableQueueMetrics/.test(queueOrchestration), 'Queue orchestration must expose queue observability');

const observabilityRoute = read('app/api/system-admin/observability/route.ts');
assert(/buildScaleReadinessSnapshot/.test(observabilityRoute), 'System-admin observability must expose scale readiness snapshot');
assert(/scaleReadiness/.test(observabilityRoute), 'System-admin observability response must include scaleReadiness');

const runtimeSync = read('lib/pos-runtime/runtime-sync-engine.ts');
assert(/activeRuntimeSubscriptionCount/.test(runtimeSync), 'Runtime sync must expose subscription count for scale auditing');
assert(/runtimeSyncInFlightSuppressionCount/.test(runtimeSync), 'Runtime sync must expose overlap suppression count');
assert(/protectPendingOptimisticMutation/.test(runtimeSync), 'Runtime sync must protect optimistic mutations at scale');

const eventBus = read('lib/pos-runtime/runtime-event-bus.ts');
assert(/MAX_RUNTIME_LISTENERS/.test(eventBus), 'Runtime event bus must bound listener scale');
assert(/runtimeEventSuppressionCount/.test(eventBus), 'Runtime event bus must expose duplicate suppression count');

const deployPlan = read('DEPLOYMENT_RECOVERY_PLAN.md');
assert(/rollback/i.test(deployPlan), 'Deployment recovery plan must document rollback readiness');

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const phrase of [
  'Every background operation must have deterministic ownership',
  'Every queue must have bounded retries',
  'Every tenant operation must be auditable',
  'Every realtime subscription must scale deterministically',
  'Every deploy must support rollback safety',
  'No rewrite is introduced in Phase 8',
]) {
  assert(docsText.includes(phrase), `Phase 8 docs must include rule: ${phrase}`);
}

const queueNames = ['onboarding', 'template-import', 'analytics', 'stock-recalculation', 'report-generation', 'observability-aggregation', 'ai-task', 'notification'];
for (const queue of queueNames) {
  assert(scaleReadiness.includes(`queue: '${queue}'`), `Scale readiness missing orchestration queue contract: ${queue}`);
}

const optionalScaleTestScripts = [
  'enterprise:test-tenant-stress',
  'enterprise:test-concurrency',
  'enterprise:test-websocket-isolation',
  'enterprise:test-redis-isolation',
  'enterprise:load-test',
];
const missingScaleScripts = optionalScaleTestScripts.filter((script) => !packageJson.scripts?.[script]);
if (missingScaleScripts.length > 0) {
  warn(`Scale test scripts missing or renamed: ${missingScaleScripts.join(', ')}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-8-scalability-multi-tenant-operations-production-readiness',
  diagnostics: {
    scaleReadiness: Boolean(scaleReadiness),
    queueOwnership: /getQueueOwnershipContracts/.test(scaleReadiness),
    workerOwnership: /getWorkerOwnershipContracts/.test(scaleReadiness),
    tenantOperations: /getTenantOperationContracts/.test(scaleReadiness),
    cacheSegmentation: /getCacheSegmentationContracts/.test(scaleReadiness),
    realtimeScale: /getRealtimeScaleContracts/.test(scaleReadiness),
  },
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
