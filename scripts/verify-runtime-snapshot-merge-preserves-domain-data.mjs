import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runtimeStatePath = path.join(root, 'lib', 'client', 'runtime-state.ts');
const runtimeState = fs.readFileSync(runtimeStatePath, 'utf8');

const checks = [];

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail });
}

check(
  'Runtime refresh uses key-level merge instead of sparse full replacement',
  runtimeState.includes('function mergeRuntimeSnapshots') &&
    runtimeState.includes('const merged: RuntimeSnapshot = { ...snapshots[scope], ...incoming };') &&
    !runtimeState.includes('if (!localIsNewer) return normalized.snapshot;'),
);

check(
  'Sparse snapshots preserve current account runtime data',
  runtimeState.includes("const DOMAIN_RUNTIME_KEYS = [") &&
    runtimeState.includes("'adisyon-local-accounts'") &&
    runtimeState.includes("'adisyon-finance-account-transactions'"),
);

check(
  'Sparse snapshots preserve POS catalog and table runtime data',
  runtimeState.includes("'adisyon-sale-products'") &&
    runtimeState.includes("'adisyon-table-layout-state'") &&
    runtimeState.includes("'aurelia-table-state-sync-meta'"),
);

check(
  'Missing keys do not delete local data without an explicit tombstone',
  runtimeState.includes("const SNAPSHOT_DELETED_KEYS = '__adisyumRuntimeDeletedKeys';") &&
    runtimeState.includes('function readDeletedRuntimeKeys') &&
    runtimeState.includes('deletedKeys') &&
    runtimeState.includes('delete merged[key];'),
);

check(
  'Runtime identity tracks branch as well as tenant',
  runtimeState.includes('const activeBranchIds: Record<RuntimeScope, string | null>') &&
    runtimeState.includes('activeTenantIds[scope] === currentIdentity && activeBranchIds[scope] === currentBranchId') &&
    runtimeState.includes("const channelKey = `${scope}:${activeTenantIds[scope]}:${activeBranchIds[scope] ?? 'global'}`;"),
);

check(
  'Null table snapshot version cannot authorize business data removal',
  runtimeState.includes('runtimeSnapshotVersion: readTableSnapshotVersion(snapshot)?.version ?? null') &&
    runtimeState.includes('const merged = mergeRuntimeSnapshots(scope, normalized.snapshot);') &&
    runtimeState.includes('if (!localIsNewer) return merged;'),
);

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}${item.detail ? ` - ${item.detail}` : ''}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} runtime snapshot merge checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} runtime snapshot merge checks passed.`);
