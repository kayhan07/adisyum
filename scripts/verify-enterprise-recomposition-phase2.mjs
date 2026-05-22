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
  'RUNTIME_OWNERSHIP_GRAPH.md',
  'RUNTIME_RECURSION_FORENSICS.md',
  'OPTIMISTIC_MUTATION_LIFECYCLE.md',
  'PERSISTENCE_AND_HYDRATION_RULES.md',
];

const requiredEngines = [
  'lib/runtime/table-state-engine.ts',
  'lib/pos-runtime/runtime-sync-engine.ts',
  'lib/pos-runtime/runtime-persistence-engine.ts',
  'lib/pos-runtime/runtime-event-bus.ts',
  'lib/runtime/runtime-session-engine.ts',
  'lib/pos-runtime/order-mutations.ts',
  'lib/runtime/runtime-api.ts',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 2 runtime document: ${doc}`);
for (const engine of requiredEngines) assert(exists(engine), `Missing runtime engine: ${engine}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase2-validate']), 'Missing package script: recomposition:phase2-validate');

const sourceFiles = walk('app')
  .concat(walk('components'))
  .concat(walk('lib'))
  .filter((file) => /\.(ts|tsx|js|jsx|mjs)$/.test(file));

const runtimeApi = read('lib/runtime/runtime-api.ts');
assert(/POS_TABLE_ORDERS_API\s*=\s*['"]\/api\/pos\/table-orders['"]/.test(runtimeApi), 'runtime-api must own canonical POS table-orders path');
assert(/credentials:\s*init\.credentials\s*\?\?\s*['"]include['"]/.test(runtimeApi), 'runtimeFetch must include credentials by default');

const posApiOwners = filesContaining(sourceFiles, /POS_TABLE_ORDERS_API|\/api\/pos\/table-orders/);
const allowedPosApiOwners = new Set([
  'lib/runtime/runtime-api.ts',
  'lib/pos-runtime/order-mutations.ts',
  'lib/pos-runtime/runtime-sync-engine.ts',
]);
const unexpectedPosApiOwners = posApiOwners.filter((file) => !allowedPosApiOwners.has(file));
assert(
  unexpectedPosApiOwners.length === 0,
  `POS table-orders API ownership drift: ${unexpectedPosApiOwners.join(', ')}`,
);

const directFetches = filesContaining(sourceFiles, /fetch\(\s*['"`]\/api\/pos\/table-orders|runtimeFetch\(\s*POS_TABLE_ORDERS_API/);
const unexpectedFetches = directFetches.filter((file) => ![
  'lib/pos-runtime/order-mutations.ts',
  'lib/pos-runtime/runtime-sync-engine.ts',
].includes(file));
assert(
  unexpectedFetches.length === 0,
  `Authoritative POS fetch must stay inside mutation/sync engines: ${unexpectedFetches.join(', ')}`,
);

const eventEmitters = filesContaining(sourceFiles, /emitRuntimeEvent\(/);
const allowedEventEmitters = new Set([
  'lib/pos-runtime/runtime-event-bus.ts',
  'lib/pos-runtime/runtime-persistence-engine.ts',
  'lib/runtime/runtime-session-engine.ts',
  'lib/device-runtime/device-session-registry.ts',
]);
const unexpectedEventEmitters = eventEmitters.filter((file) => !allowedEventEmitters.has(file));
assert(
  unexpectedEventEmitters.length === 0,
  `Runtime event emission outside event-owned boundaries: ${unexpectedEventEmitters.join(', ')}`,
);

const eventBus = read('lib/pos-runtime/runtime-event-bus.ts');
assert(/lastEventFingerprint/.test(eventBus), 'Runtime event bus must suppress duplicate events');
assert(/runtimeEventEmissionCount/.test(eventBus), 'Runtime event bus must expose bounded emission diagnostics');
assert(/subscribeRuntimeEvents/.test(eventBus), 'Runtime event bus must own runtime subscriptions');

const mutationIdFiles = filesContaining(sourceFiles, /createMutationId|mutationId\s*=\s*`/);
const unexpectedMutationIdFiles = mutationIdFiles.filter((file) => file !== 'lib/pos-runtime/order-mutations.ts');
assert(
  unexpectedMutationIdFiles.length === 0,
  `Mutation id generation must stay in order-mutations runtime: ${unexpectedMutationIdFiles.join(', ')}`,
);

const optimisticFiles = filesContaining(sourceFiles, /createOptimisticLine|appendOptimisticLine|rollbackOrderMutation|commitOrderMutation|dispatchOrderMutation/);
const unexpectedOptimisticOwners = optimisticFiles.filter((file) => ![
  'lib/pos-runtime/order-mutations.ts',
  'components/order-composer.tsx',
].includes(file));
assert(
  unexpectedOptimisticOwners.length === 0,
  `Unexpected optimistic mutation ownership call sites: ${unexpectedOptimisticOwners.join(', ')}`,
);

const reconcileTableStateUsers = filesContaining(sourceFiles, /reconcileTableState/);
const unexpectedTableReconcilers = reconcileTableStateUsers.filter((file) => ![
  'lib/runtime/table-state-engine.ts',
  'lib/pos-runtime/runtime-sync-engine.ts',
].includes(file));
assert(
  unexpectedTableReconcilers.length === 0,
  `Table reconciliation must flow through table-state-engine/runtime-sync-engine: ${unexpectedTableReconcilers.join(', ')}`,
);

const syncEngine = read('lib/pos-runtime/runtime-sync-engine.ts');
assert(/reconcileInFlight/.test(syncEngine), 'Runtime sync engine must guard in-flight reconciliation');
assert(/protectPendingOptimisticMutation/.test(syncEngine), 'Runtime sync engine must protect pending optimistic mutations');
assert(/window\.addEventListener\('focus'/.test(syncEngine), 'Runtime sync engine must own focus sync');
assert(/window\.setInterval/.test(syncEngine), 'Runtime sync engine must own interval sync');

const syncCallers = filesContaining(sourceFiles, /startAuthoritativeRuntimeSync|hydrateAuthoritativeRuntime|reconcileRuntimeSyncSnapshot/);
const unexpectedSyncCallers = syncCallers.filter((file) => ![
  'lib/pos-runtime/runtime-sync-engine.ts',
  'components/order-composer.tsx',
].includes(file));
assert(
  unexpectedSyncCallers.length === 0,
  `Unexpected authoritative sync orchestration call sites: ${unexpectedSyncCallers.join(', ')}`,
);

const authoritativeAdapter = read('lib/client/authoritative-table-orders.ts');
assert(/fetchAuthoritativeTablePayload/.test(authoritativeAdapter), 'authoritative-table-orders adapter must use runtime-sync-engine fetch ownership');
assert(!/POS_TABLE_ORDERS_API|runtimeFetch/.test(authoritativeAdapter), 'authoritative-table-orders adapter must not own API URL/fetch');

const persistenceEngine = read('lib/pos-runtime/runtime-persistence-engine.ts');
assert(/redundant persistence suppressed/.test(persistenceEngine), 'Runtime persistence engine must suppress redundant writes');
assert(/restoreRuntimeJson/.test(persistenceEngine), 'Runtime persistence engine must own snapshot restore helpers');
assert(/persistRuntimeJson/.test(persistenceEngine), 'Runtime persistence engine must own snapshot write helpers');

const directRuntimeStateInOrderComposer = /readRuntimeItem|writeRuntimeItem|localStorage|sessionStorage/.test(read('components/order-composer.tsx'));
assert(!directRuntimeStateInOrderComposer, 'POS order composer must not directly own runtime persistence primitives');

const directRenderEventFiles = filesContaining(
  walk('app').concat(walk('components')).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file)),
  /emitRuntimeEvent\(|window\.localStorage\.setItem\(|window\.sessionStorage\.setItem\(/,
);
const allowedUiBrowserPersistence = new Set([
  'app/layout.tsx',
  'components/theme-toggle.tsx',
  'components/providers/app-runtime-provider.tsx',
]);
const unexpectedUiSideEffects = directRenderEventFiles.filter((file) => !allowedUiBrowserPersistence.has(file));
assert(
  unexpectedUiSideEffects.length === 0,
  `UI must not directly emit runtime events or browser persistence writes: ${unexpectedUiSideEffects.join(', ')}`,
);

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-2-runtime-ownership-consolidation',
  ownership: {
    posApiOwners,
    eventEmitters,
    syncCallers,
    optimisticFiles,
  },
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
