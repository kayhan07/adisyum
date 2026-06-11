import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type JsonRecord = Record<string, unknown>;

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
    const branchId = url.searchParams.get('branchId') ?? tenant.branchId ?? null;
    const key = tableStateKey(branchId);
    const stored = await prisma.runtimeState.findUnique({
      where: runtimeStateTenantKey(tenant.tenantId, key),
      select: { payload: true },
    }).catch(() => null);
    const state = stored?.payload && typeof stored.payload === 'object'
      ? stored.payload
      : getDefaultState();

    return NextResponse.json({
      ok: true,
      tenantId: tenant.tenantId,
      branchId,
      key,
      state,
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

  const branchId = body.branchId ?? tenant.branchId ?? null;
  const key = tableStateKey(branchId);
  const stored = await prisma.runtimeState.findUnique({
    where: runtimeStateTenantKey(tenant.tenantId, key),
    select: { payload: true },
  });
  const current = stored?.payload && typeof stored.payload === 'object'
    ? stored.payload as SharedTablePaymentState
    : getDefaultState();
  const nextState = {
    tables: Array.isArray(body.tables)
      ? body.tables.filter((value) => value && typeof value === 'object')
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
  const persistedState = JSON.parse(JSON.stringify(nextState)) as JsonRecord;

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
    state: nextState,
  });
}
