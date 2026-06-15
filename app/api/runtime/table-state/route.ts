import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';
import { toPrismaJson } from '@/lib/db/prisma-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SharedTablePaymentState = {
  tables: unknown[];
  paymentRequestedTableIds: string[];
  liveTotals: Record<string, number>;
  ordersByTable: Record<string, unknown[]>;
  tableMeta: Record<string, unknown>;
  stateMeta: Record<string, unknown> | null;
  updatedAt: string;
};

const TABLE_STATE_KEY = 'table-payment-state';

function tableStateKey(branchId?: string | null) {
  return `${TABLE_STATE_KEY}:${branchId || 'global'}`;
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tableBranchId(value: unknown) {
  const metadata = metadataRecord(value);
  const branchId = metadata.branchId;
  return typeof branchId === 'string' && branchId.trim() ? branchId.trim() : null;
}

function tableKey(value: unknown, fallback: string) {
  const metadata = metadataRecord(value);
  const key = metadata.tableKey ?? metadata.tableId;
  return typeof key === 'string' && key.trim() ? key.trim() : fallback;
}

function tableGroup(value: unknown) {
  const metadata = metadataRecord(value);
  const group = metadata.group ?? metadata.area;
  return typeof group === 'string' && group.trim() ? group.trim() : 'Salon';
}

function normalizeTableInput(table: unknown, branchId: string | null) {
  if (!table || typeof table !== 'object') return null;
  const record = table as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null;
  if (!id) return null;
  const tableBranch = typeof record.branchId === 'string' && record.branchId.trim()
    ? record.branchId.trim()
    : branchId ?? 'mrk';
  const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : id;
  const group = typeof record.group === 'string' && record.group.trim() ? record.group.trim() : 'Salon';
  const status = record.status === 'occupied' || record.status === 'reserved' ? record.status : 'available';
  const guests = Number.isFinite(Number(record.guests)) ? Number(record.guests) : 0;
  const total = Number.isFinite(Number(record.total)) ? Number(record.total) : 0;
  return {
    id,
    branchId: tableBranch,
    name,
    group,
    status,
    guests,
    total,
    paymentRequested: Boolean(record.paymentRequested),
  };
}

async function resolveBranchId(tenant: Awaited<ReturnType<typeof requireTenant>>, requestedBranchId: string | null) {
  if (requestedBranchId === 'all') return 'all';
  if (requestedBranchId?.trim()) return requestedBranchId.trim();
  if (tenant.branchId?.trim()) return tenant.branchId.trim();

  const tenantRecord = await prisma.tenant.findUnique({
    where: { tenantId: tenant.tenantId },
    select: { mainBranchId: true },
  }).catch(() => null);
  if (tenantRecord?.mainBranchId) return tenantRecord.mainBranchId;

  const branches = await prisma.branch.findMany({
    where: { tenantId: tenant.tenantId, active: true, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }],
    select: { branchId: true },
    take: 2,
  }).catch(() => []);
  if (branches.length === 1) return branches[0].branchId;
  return branches[0]?.branchId ?? 'mrk';
}

async function loadDbTables(tenantId: string, branchId: string | null) {
  const rows = await prisma.posTable.findMany({
    where: { tenantId },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, name: true, status: true, seats: true, metadata: true },
  });

  return rows
    .map((row) => {
      const metadata = metadataRecord(row.metadata);
      const rowBranchId = tableBranchId(metadata);
      const effectiveBranchId = rowBranchId ?? (branchId && branchId !== 'all' ? branchId : 'mrk');
      return {
        id: tableKey(metadata, row.id),
        branchId: effectiveBranchId,
        name: row.name,
        group: tableGroup(metadata),
        status: row.status === 'occupied' || row.status === 'reserved' ? row.status : 'available',
        guests: Number.isFinite(Number(metadata.guests)) ? Number(metadata.guests) : row.seats,
        total: 0,
        paymentRequested: false,
      };
    })
    .filter((table) => branchId === 'all' || !branchId || table.branchId === branchId);
}

async function persistDbTables(tenantId: string, branchId: string | null, tables: unknown[]) {
  const normalizedTables = tables
    .map((table) => normalizeTableInput(table, branchId))
    .filter((table): table is NonNullable<ReturnType<typeof normalizeTableInput>> => Boolean(table));
  if (normalizedTables.length === 0) return [];

  const existingRows = await prisma.posTable.findMany({
    where: { tenantId },
    select: { id: true, name: true, metadata: true },
  });
  const byTableKey = new Map(existingRows.map((row) => [tableKey(row.metadata, row.id), row]));

  await Promise.all(normalizedTables.map((table) => {
    const existing = byTableKey.get(table.id);
    const metadata = {
      ...(existing ? metadataRecord(existing.metadata) : {}),
      tableKey: table.id,
      branchId: table.branchId,
      group: table.group,
      source: 'runtime-table-state',
    };
    if (existing) {
      return prisma.posTable.update({
        where: { id: existing.id },
        data: {
          name: table.name,
          status: table.status,
          seats: table.guests,
          metadata: toPrismaJson(metadata),
        },
      });
    }
    return prisma.posTable.create({
      data: {
        tenantId,
        name: table.name,
        status: table.status,
        seats: table.guests,
        metadata: toPrismaJson(metadata),
      },
    });
  }));

  return normalizedTables;
}

function getDefaultState(): SharedTablePaymentState {
  return {
    tables: [],
    paymentRequestedTableIds: [],
    liveTotals: {},
    ordersByTable: {},
    tableMeta: {},
    stateMeta: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const url = new URL(request.url);
    const branchId = await resolveBranchId(tenant, url.searchParams.get('branchId'));
    const key = tableStateKey(branchId);
    const stored = await prisma.runtimeState.findUnique({
      where: runtimeStateTenantKey(tenant.tenantId, key),
      select: { payload: true },
    }).catch(() => null);
    const runtimeState = stored?.payload && typeof stored.payload === 'object'
      ? stored.payload
      : getDefaultState();
    let dbTables = await loadDbTables(tenant.tenantId, branchId);
    const runtimeTables = Array.isArray((runtimeState as SharedTablePaymentState).tables)
      ? (runtimeState as SharedTablePaymentState).tables
      : [];
    if (dbTables.length === 0 && runtimeTables.length > 0) {
      await persistDbTables(tenant.tenantId, branchId, runtimeTables);
      dbTables = await loadDbTables(tenant.tenantId, branchId);
    }
    const state = {
      ...(runtimeState as SharedTablePaymentState),
      tables: dbTables,
    };
    const includeDebug = process.env.NODE_ENV !== 'production' || process.env.TABLE_STATE_DEBUG === '1';

    return NextResponse.json({
      ok: true,
      tenantId: tenant.tenantId,
      branchId,
      key,
      source: 'server',
      tableCount: dbTables.length,
      state,
      ...(includeDebug ? { debug: { tenantId: tenant.tenantId, branchId, tableCount: dbTables.length, source: 'server' } } : {}),
    });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let tenant: Awaited<ReturnType<typeof requireTenant>>;
  try {
    tenant = await requireTenant(request);
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as (Partial<SharedTablePaymentState> & { branchId?: string }) | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Geçersiz table state payload.' }, { status: 400 });
  }

  const branchId = await resolveBranchId(tenant, body.branchId ?? null);
  const key = tableStateKey(branchId);
  const stored = await prisma.runtimeState.findUnique({
    where: runtimeStateTenantKey(tenant.tenantId, key),
    select: { payload: true },
  });
  const current = stored?.payload && typeof stored.payload === 'object'
    ? stored.payload as SharedTablePaymentState
    : getDefaultState();
  const persistedTables = Array.isArray(body.tables)
    ? await persistDbTables(tenant.tenantId, branchId, body.tables)
    : undefined;
  const nextState = {
    tables: Array.isArray(body.tables)
      ? persistedTables ?? body.tables.filter((value) => value && typeof value === 'object')
      : current.tables ?? [],
    paymentRequestedTableIds: Array.isArray(body.paymentRequestedTableIds)
      ? body.paymentRequestedTableIds.filter((value): value is string => typeof value === 'string')
      : current.paymentRequestedTableIds,
    liveTotals: body.liveTotals && typeof body.liveTotals === 'object'
      ? Object.fromEntries(Object.entries(body.liveTotals).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
      : current.liveTotals,
    ordersByTable: body.ordersByTable && typeof body.ordersByTable === 'object'
      ? Object.fromEntries(Object.entries(body.ordersByTable).filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1])))
      : current.ordersByTable,
    tableMeta: body.tableMeta && typeof body.tableMeta === 'object'
      ? body.tableMeta
      : current.tableMeta,
    stateMeta: {
      ...(current.stateMeta && typeof current.stateMeta === 'object' ? current.stateMeta : {}),
      ...(body.stateMeta && typeof body.stateMeta === 'object' ? body.stateMeta : {}),
      tenantId: tenant.tenantId,
      branchId,
      updatedAtMs: Date.now(),
    },
    updatedAt: new Date().toISOString(),
  };
  const persistedState = toPrismaJson(nextState);

  await prisma.runtimeState.upsert({
    where: runtimeStateTenantKey(tenant.tenantId, key),
    update: { payload: persistedState },
    create: { tenantId: tenant.tenantId, key, payload: persistedState },
  });

  return NextResponse.json({
    ok: true,
    tenantId: tenant.tenantId,
    branchId,
    key,
    source: 'server',
    tableCount: nextState.tables.length,
    state: nextState,
  });
}
