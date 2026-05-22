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
  'RUNTIME_PERFORMANCE_FORENSICS.md',
  'WEBSOCKET_LIFECYCLE_FORENSICS.md',
  'HYDRATION_AND_RECONCILIATION_COSTS.md',
  'RUNTIME_MEMORY_FORENSICS.md',
  'OPTIMISTIC_RUNTIME_PERFORMANCE.md',
  'EVENT_BUS_PERFORMANCE_RULES.md',
  'PERSISTENCE_COST_ANALYSIS.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 6 performance forensics document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase6-validate']), 'Missing package script: recomposition:phase6-validate');

const appFiles = walk('app').filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const componentFiles = walk('components').filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const libFiles = walk('lib').filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));
const sourceFiles = appFiles.concat(componentFiles, libFiles);

const eventBus = read('lib/pos-runtime/runtime-event-bus.ts');
assert(/getRuntimeEventBusDiagnostics/.test(eventBus), 'Runtime event bus must expose bounded diagnostics');
assert(/runtimeEventListenerCount/.test(eventBus), 'Runtime event bus diagnostics must include listener count');
assert(/runtimeEventSuppressionCount/.test(eventBus), 'Runtime event bus must count duplicate suppression');
assert(/MAX_RUNTIME_LISTENERS/.test(eventBus), 'Runtime event bus must define listener soft limit');
assert(/MAX_RUNTIME_EVENT_PAYLOAD_BYTES/.test(eventBus), 'Runtime event bus must define event payload soft limit');
assert(/listeners\.delete/.test(eventBus), 'Runtime event subscriptions must have cleanup');

const syncEngine = read('lib/pos-runtime/runtime-sync-engine.ts');
assert(/getRuntimeSyncDiagnostics/.test(syncEngine), 'Runtime sync engine must expose diagnostics');
assert(/activeRuntimeSubscriptionCount/.test(syncEngine), 'Runtime sync diagnostics must include active subscription count');
assert(/runtimeSyncInFlightSuppressionCount/.test(syncEngine), 'Runtime sync engine must count overlapping sync suppression');
assert(/window\.clearInterval/.test(syncEngine), 'Runtime sync intervals must have deterministic cleanup');
assert(/window\.removeEventListener\('focus'/.test(syncEngine), 'Runtime sync focus listener must have deterministic cleanup');
assert(/reconcileInFlight/.test(syncEngine), 'Runtime sync engine must guard overlapping reconciliation');
assert(/protectPendingOptimisticMutation/.test(syncEngine), 'Runtime sync engine must protect optimistic mutations');

const persistenceEngine = read('lib/pos-runtime/runtime-persistence-engine.ts');
assert(/getRuntimePersistenceDiagnostics/.test(persistenceEngine), 'Runtime persistence engine must expose diagnostics');
assert(/runtimePersistenceWriteCount/.test(persistenceEngine), 'Runtime persistence must count writes');
assert(/runtimePersistenceSuppressedWriteCount/.test(persistenceEngine), 'Runtime persistence must count suppressed writes');
assert(/MAX_RUNTIME_SNAPSHOT_BYTES/.test(persistenceEngine), 'Runtime persistence must define snapshot size soft limit');
assert(/readRuntimeItem\(scope, key\) === nextSerialized/.test(persistenceEngine), 'Runtime persistence must suppress redundant writes');

const orderMutations = read('lib/pos-runtime/order-mutations.ts');
assert(/getOrderMutationRuntimeDiagnostics/.test(orderMutations), 'Order mutations runtime must expose diagnostics');
assert(/runtimeMutationCreatedCount/.test(orderMutations), 'Order mutations runtime must count created mutations');
assert(/runtimeMutationDispatchedCount/.test(orderMutations), 'Order mutations runtime must count dispatched mutations');
assert(/runtimeMutationCommittedCount/.test(orderMutations), 'Order mutations runtime must count committed mutations');
assert(/runtimeMutationRolledBackCount/.test(orderMutations), 'Order mutations runtime must count rollbacks');
assert(/MAX_PENDING_MUTATION_AGE_MS/.test(orderMutations), 'Order mutations runtime must define pending mutation age limit');

const tableState = read('lib/runtime/table-state-engine.ts');
assert(/reconcileTableState/.test(tableState), 'Table state engine must remain reconciliation owner');

const runtimeEventEmitters = filesContaining(sourceFiles, /emitRuntimeEvent\(/)
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
assert(directRuntimeStorageWriters.length === 0, `UI runtime storage writes can trigger persistence loops: ${directRuntimeStorageWriters.join(', ')}`);

const directIntervals = filesContaining(appFiles.concat(componentFiles), /setInterval\(/)
  .filter((file) => !['components/providers/app-runtime-provider.tsx'].includes(file));
if (directIntervals.length > 0) {
  warn(`UI interval ownership exists and should remain audited for cleanup: ${directIntervals.join(', ')}`);
}

const websocketListeners = filesContaining(sourceFiles, /new WebSocket|Pusher|Echo|subscribeRuntimeEvents|addEventListener\(['"]storage|addEventListener\(['"]focus/)
  .filter((file) => ![
    'lib/pos-runtime/runtime-sync-engine.ts',
    'lib/pos-runtime/runtime-event-bus.ts',
    'components/providers/app-runtime-provider.tsx',
    'lib/realtime/kds-echo.ts',
    'lib/realtime/tenant-events.ts',
  ].includes(file));
if (websocketListeners.length > 0) {
  warn(`Runtime listener/subscription sites require lifecycle audit: ${websocketListeners.join(', ')}`);
}

const reconcileUsers = filesContaining(sourceFiles, /reconcileTableState/)
  .filter((file) => ![
    'lib/runtime/table-state-engine.ts',
    'lib/pos-runtime/runtime-sync-engine.ts',
  ].includes(file));
assert(reconcileUsers.length === 0, `Reconciliation ownership drift: ${reconcileUsers.join(', ')}`);

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const phrase of [
  'Render phase must remain pure',
  'Every subscription must have deterministic cleanup',
  'Every persistence write must be deduplicated',
  'Every runtime event must be bounded',
  'No rewrite is introduced in Phase 6',
]) {
  assert(docsText.includes(phrase), `Phase 6 docs must include rule: ${phrase}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-6-performance-memory-runtime-stability',
  diagnostics: {
    eventBus: {
      bounded: /MAX_RUNTIME_LISTENERS/.test(eventBus),
      listenerCleanup: /listeners\.delete/.test(eventBus),
    },
    sync: {
      activeSubscriptionCount: /activeRuntimeSubscriptionCount/.test(syncEngine),
      cleanup: /clearInterval/.test(syncEngine) && /removeEventListener/.test(syncEngine),
    },
    persistence: {
      writeDeduplication: /readRuntimeItem\(scope, key\) === nextSerialized/.test(persistenceEngine),
      sizeLimit: /MAX_RUNTIME_SNAPSHOT_BYTES/.test(persistenceEngine),
    },
    mutations: {
      pendingAgeLimit: /MAX_PENDING_MUTATION_AGE_MS/.test(orderMutations),
    },
  },
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
