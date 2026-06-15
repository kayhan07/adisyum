import { readFileSync } from 'node:fs';

const checks = [];

function read(path) {
  return readFileSync(path, 'utf8');
}

function check(name, ok) {
  checks.push({ name, ok: Boolean(ok) });
}

const tableStateRoute = read('app/api/runtime/table-state/route.ts');
const tableLayoutStore = read('lib/table-layout-store.ts');
const sessionStore = read('lib/session-store.ts');
const authMeRoute = read('app/api/auth/me/route.ts');
const schema = read('prisma/schema.prisma');

check('runtime table-state requires tenant session', tableStateRoute.includes('requireTenant(request)'));
check('runtime table-state resolves branch from request session tenant main branch or single branch', tableStateRoute.includes('async function resolveBranchId') && tableStateRoute.includes('mainBranchId') && tableStateRoute.includes('prisma.branch.findMany'));
check('runtime table-state stores table definitions in PosTable DB source of truth', tableStateRoute.includes('prisma.posTable.findMany') && tableStateRoute.includes('prisma.posTable.create') && tableStateRoute.includes('prisma.posTable.update'));
check('runtime table-state keys POS table identity by metadata.tableKey', tableStateRoute.includes('tableKey') && tableStateRoute.includes('metadata.tableKey'));
check('runtime table-state scopes visible tables by metadata.branchId', tableStateRoute.includes('tableBranchId') && tableStateRoute.includes('table.branchId === branchId'));
check('runtime table-state preserves legacy/null branch tables by assigning selected branch', tableStateRoute.includes("rowBranchId ?? (branchId && branchId !== 'all' ? branchId : 'mrk')"));
check('runtime table-state response declares server source and tableCount', tableStateRoute.includes("source: 'server'") && tableStateRoute.includes('tableCount'));
check('runtime table-state exposes tenant/branch/tableCount debug outside production only', tableStateRoute.includes('TABLE_STATE_DEBUG') && tableStateRoute.includes('debug: { tenantId: tenant.tenantId, branchId, tableCount'));
check('runtime table-state repairs runtime-only table layouts into PosTable', tableStateRoute.includes('dbTables.length === 0 && runtimeTables.length > 0') && tableStateRoute.includes('persistDbTables(tenant.tenantId, branchId, runtimeTables)'));
check('client table layout fetches server runtime table-state with no-store', tableLayoutStore.includes("runtimeFetch(`/api/runtime/table-state${query}`") && tableLayoutStore.includes("cache: 'no-store'"));
check('client table layout local cache remains tenant and branch scoped offline fallback', tableLayoutStore.includes('LOCAL_STORAGE_KEY') && tableLayoutStore.includes('${session.tenantId}:${branchId}'));
check('session hydrate accepts live branch ids not present in demo defaults', sessionStore.includes('const activeBranchId = session.branchId || defaults.activeBranchId') && sessionStore.includes("type: 'Canli sube'") && sessionStore.includes('branches = knownBranch ? defaults.branches : [...defaults.branches, activeBranch]'));
check('auth/me returns branchName for hydrated live branch label', authMeRoute.includes('branchName: branch?.name'));
check('Prisma PosTable exists for authoritative floor table definitions', schema.includes('model PosTable') && schema.includes('@@map("tables")'));

const failed = checks.filter((item) => !item.ok);
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
if (failed.length > 0) {
  console.error(`\n${failed.length}/${checks.length} tables visible across devices checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} tables visible across devices checks passed.`);
