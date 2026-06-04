import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SharedTablePaymentState = {
  tables: unknown[];
  paymentRequestedTableIds: string[];
  liveTotals: Record<string, number>;
  tableMeta: Record<string, unknown>;
  updatedAt: string;
};

const TABLE_STATE_KEY = 'table-payment-state';

function getDefaultState(): SharedTablePaymentState {
  return {
    tables: [],
    paymentRequestedTableIds: [],
    liveTotals: {},
    tableMeta: {},
    updatedAt: new Date(0).toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenant(request);
    const stored = await prisma.runtimeState.findUnique({
      where: runtimeStateTenantKey(tenant.tenantId, TABLE_STATE_KEY),
      select: { payload: true },
    }).catch(() => null);

    if (stored?.payload && typeof stored.payload === 'object') {
      return NextResponse.json({ ok: true, state: stored.payload });
    }

    return NextResponse.json({ ok: true, state: getDefaultState() });
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let tenantId = '';
  try {
    tenantId = (await requireTenant(request)).tenantId;
  } catch (error) {
    return tenantAuthErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as Partial<SharedTablePaymentState> | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: 'Geçersiz table state payload.' }, { status: 400 });
  }

  const stored = await prisma.runtimeState.findUnique({
    where: runtimeStateTenantKey(tenantId, TABLE_STATE_KEY),
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
    tableMeta: body.tableMeta && typeof body.tableMeta === 'object'
      ? body.tableMeta
      : current.tableMeta,
    updatedAt: new Date().toISOString(),
  };
  const persistedState = JSON.parse(JSON.stringify(nextState)) as Prisma.InputJsonValue;

  await prisma.runtimeState.upsert({
    where: runtimeStateTenantKey(tenantId, TABLE_STATE_KEY),
    update: { payload: persistedState },
    create: { tenantId, key: TABLE_STATE_KEY, payload: persistedState },
  }).catch(() => undefined);

  return NextResponse.json({ ok: true, state: nextState });
}
