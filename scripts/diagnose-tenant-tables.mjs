import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function metadataRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function metadataBranchId(value) {
  const branchId = metadataRecord(value).branchId;
  return typeof branchId === 'string' && branchId.trim() ? branchId.trim() : null;
}

function metadataTableKey(value, fallback) {
  const metadata = metadataRecord(value);
  const key = metadata.tableKey ?? metadata.tableId;
  return typeof key === 'string' && key.trim() ? key.trim() : fallback;
}

try {
  const [tenantCount, branchCount, branches, tableCount, latestTables] = await Promise.all([
    prisma.tenant.count({ where: { deletedAt: null } }),
    prisma.branch.count({ where: { deletedAt: null } }),
    prisma.branch.findMany({
      where: { deletedAt: null },
      orderBy: [{ tenantId: 'asc' }, { branchId: 'asc' }],
      select: { tenantId: true, branchId: true, name: true, active: true },
    }),
    prisma.posTable.count(),
    prisma.posTable.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: { id: true, tenantId: true, name: true, status: true, metadata: true, updatedAt: true },
    }),
  ]);

  const allTables = await prisma.posTable.findMany({
    select: { id: true, tenantId: true, name: true, metadata: true },
  });

  const tableCounts = new Map();
  const tenantBranches = new Set(branches.map((branch) => `${branch.tenantId}:${branch.branchId}`));
  const branchMismatch = [];

  for (const table of allTables) {
    const branchId = metadataBranchId(table.metadata);
    const key = `${table.tenantId}:${branchId ?? '(null)'}`;
    tableCounts.set(key, (tableCounts.get(key) ?? 0) + 1);
    if (branchId && !tenantBranches.has(`${table.tenantId}:${branchId}`)) {
      branchMismatch.push({
        tenantId: table.tenantId,
        tableId: metadataTableKey(table.metadata, table.id),
        tableName: table.name,
        branchId,
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    source: 'server-db',
    tenantCount,
    branchCount,
    tableCount,
    nullBranchTableCount: allTables.filter((table) => !metadataBranchId(table.metadata)).length,
    tableCountsByTenantBranch: Object.fromEntries([...tableCounts.entries()].sort()),
    branches: branches.map((branch) => ({
      tenantId: branch.tenantId,
      branchId: branch.branchId,
      name: branch.name,
      active: branch.active,
      tableCount: tableCounts.get(`${branch.tenantId}:${branch.branchId}`) ?? 0,
    })),
    latestTables: latestTables.map((table) => ({
      tenantId: table.tenantId,
      branchId: metadataBranchId(table.metadata),
      tableId: metadataTableKey(table.metadata, table.id),
      tableName: table.name,
      status: table.status,
      updatedAt: table.updatedAt,
    })),
    potentialIssues: {
      branchIdNullTables: allTables
        .filter((table) => !metadataBranchId(table.metadata))
        .map((table) => ({ tenantId: table.tenantId, tableId: metadataTableKey(table.metadata, table.id), tableName: table.name })),
      tableExistsButBranchMismatch: branchMismatch,
    },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    hint: 'Bu diagnose script DB erisimi olan ortamda, tercihen VPS uzerinde calistirilmalidir.',
  }, null, 2));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
