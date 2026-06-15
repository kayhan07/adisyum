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
const catalogHydrateBlock = orderComposer.slice(
  orderComposer.indexOf('const hydrateRuntimeCatalog'),
  orderComposer.indexOf('useEffect(() => {', orderComposer.indexOf('const hydrateRuntimeCatalog')),
);

check('client computes stable snapshot signature excluding metadata', runtimeState.includes('function stableSnapshotSignature') && runtimeState.includes('key !== SNAPSHOT_META_KEY'));
check('client computes stable snapshot version instead of Date.now per GET', runtimeState.includes('function stableSnapshotVersion') && runtimeState.includes('incoming?.snapshotVersion ?? stableSnapshotVersion(snapshot)'));
check('client snapshot metadata normalization is deterministic', runtimeState.includes("snapshotTimestamp: incoming?.snapshotTimestamp ?? 'normalized'"));
check('client refresh applies only when snapshots differ', runtimeState.includes('if (areSnapshotsEqual(snapshots[scope], nextSnapshot)) return snapshots[scope];'));
check('refresh applied log remains after equality guard', runtimeState.indexOf('areSnapshotsEqual(snapshots[scope], nextSnapshot)') < runtimeState.indexOf("console.info('[runtime-state] refresh applied'"));
check('preserveLocalRuntimeKeys returns original reference when merge is no-op', runtimeState.includes('if (areSnapshotsEqual(merged, incoming)) return incoming;'));
check('server computes stable snapshot signature excluding metadata', runtimeStateRoute.includes('function stableSnapshotSignature') && runtimeStateRoute.includes('key !== SNAPSHOT_META_KEY'));
check('server snapshot metadata preserves existing version or stable payload hash', runtimeStateRoute.includes('existing?.snapshotVersion ?? stableSnapshotVersion(state)'));
check('server snapshot metadata does not stamp fresh Date.now on every read', !runtimeStateRoute.includes('snapshotVersion: Date.now()'));
check('order composer tracks runtime catalog signature', orderComposer.includes('runtimeCatalogSignatureRef'));
check('same catalog revision checksum item count is noop', orderComposer.includes('runtime-catalog-hydration-noop') && orderComposer.includes('runtimeCatalogSignatureRef.current === catalogSignature'));
check('catalog noop happens before product state set', orderComposer.indexOf('runtime-catalog-hydration-noop') < orderComposer.indexOf('setStoredCatalogProducts(catalog.items)'));
check('order composer tracks selected table hydration key', orderComposer.includes('selectedTableHydrationKeyRef'));
check('same selected table branch does not forced hydrate repeatedly', orderComposer.includes('selectedTableHydrationKeyRef.current === hydrationKey') && orderComposer.includes('return;'));
check('changing table or branch produces a different hydration key', orderComposer.includes("`${activeBranchId || 'branch'}:${selectedTableId}`"));
check('table selection still forces tenant runtime once per key', orderComposer.includes("refreshRuntimeScope('tenant', { force: true, preserveLocalRuntimeKeys: true })"));
check('category selection state is not reset by catalog hydrate', orderComposer.includes("const [selectedCategory, setSelectedCategory] = useState('all')") && !catalogHydrateBlock.includes('setSelectedCategory'));
check('product search state is not reset by catalog hydrate', orderComposer.includes("const [productSearch, setProductSearch] = useState('')") && !catalogHydrateBlock.includes('setProductSearch'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} runtime refresh idempotency checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} runtime refresh idempotency checks passed.`);
