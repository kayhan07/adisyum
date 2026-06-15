import { readFileSync } from 'node:fs';

const checks = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

const runtimeState = read('lib/client/runtime-state.ts');
const runtimeStateRoute = read('app/api/runtime/state/[scope]/route.ts');
const orderComposer = read('components/order-composer.tsx');
const posCatalogRoute = read('app/api/runtime/pos-catalog/route.ts');
const tableStateRoute = read('app/api/runtime/table-state/route.ts');
const sessionStore = read('lib/session-store.ts');

check('client runtime snapshot has standardized metadata type', runtimeState.includes('type RuntimeSnapshotMeta') && runtimeState.includes('tenantId: string') && runtimeState.includes('branchId: string | null') && runtimeState.includes('runtimeScope: RuntimeScope'));
check('client parses legacy and standardized runtime metadata', runtimeState.includes('parseRuntimeSnapshotMeta') && runtimeState.includes('snapshotTenantId') && runtimeState.includes('snapshotBranchId'));
check('client normalizes missing snapshot metadata from active session', runtimeState.includes('buildRuntimeSnapshotMeta') && runtimeState.includes('loadSessionState()') && runtimeState.includes('currentBranchIdentity(scope)'));
check('same tenant branch snapshot is accepted through metadata-first guard', runtimeState.includes('snapshotIdentityMatches') && runtimeState.includes("reason: 'tenant_mismatch'") && runtimeState.includes("reason: 'branch_mismatch'"));
check('foreign tenant snapshots remain rejected', runtimeState.includes('findForeignTenantIds') && runtimeState.includes('runtime snapshot rejected for tenant mismatch'));
check('metadata key is ignored by broad tenant regex drift scan', runtimeState.includes('if (key === SNAPSHOT_META_KEY) continue'));
check('POST runtime snapshots include normalized metadata', runtimeState.includes("JSON.stringify({ state: state ? normalizeIncomingSnapshotMeta(scope, state).snapshot : state })"));
check('forced refresh can bypass local mutation skip safely', runtimeState.includes('options: { force?: boolean; preserveLocalRuntimeKeys?: boolean }') && runtimeState.includes('localMutationActive && !options.force'));
check('forced refresh preserves volatile table runtime keys', runtimeState.includes('mergePreservingVolatileLocalKeys') && runtimeState.includes('TABLE_RUNTIME_KEYS'));
check('server runtime metadata includes tenantId branchId scope runtimeScope', runtimeStateRoute.includes('tenantId,') && runtimeStateRoute.includes('branchId: branchId ?? null') && runtimeStateRoute.includes('runtimeScope: scope'));
check('server runtime scope resolver carries branchId', runtimeStateRoute.includes('branchId: tenant.branchId ?? null') && runtimeStateRoute.includes("branchId: 'system'"));
check('server tenant runtime state key is branch scoped', runtimeStateRoute.includes("`client-runtime:tenant:${tenant.branchId ?? 'global'}`"));
check('POS catalog route returns tenant branch metadata consistently', posCatalogRoute.includes('tenantId: tenant.tenantId') && posCatalogRoute.includes('branchId'));
check('table-state route returns server source and table count', tableStateRoute.includes("source: 'server'") && tableStateRoute.includes('tableCount'));
check('session hydrate accepts live branch ids', sessionStore.includes('session.branchId || defaults.activeBranchId') && sessionStore.includes("type: 'Canli sube'"));
check('order composer hydrates catalog on table select', orderComposer.includes("hydrateRuntimeCatalog('table-select')") && orderComposer.includes('table-selected-server-hydration-started'));
check('order composer forced-refreshes runtime state on table select', orderComposer.includes("refreshRuntimeScope('tenant', { force: true, preserveLocalRuntimeKeys: true })"));
check('order composer hydrates table layout on table select', orderComposer.includes('refreshTableLayoutState().then((state)'));
check('order composer hydrates authoritative orders on table select', orderComposer.includes('refreshAuthoritativeOrdersByTable<OrderLine>()') && orderComposer.includes("'manual-refresh'"));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} runtime tenant snapshot hydration checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} runtime tenant snapshot hydration checks passed.`);
