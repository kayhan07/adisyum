import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { runtimeStateTenantKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { getSessionFromRequest, forbiddenResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { isSessionActive } from '@/lib/server/session-guard';
import { logError, logInfo } from '@/lib/observability/structured-logger';
import { recordRequestMetric, recordTenantError } from '@/lib/observability/metrics-store';
import { filterSellableProducts } from '@/lib/product-domain';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SYSTEM_ADMIN_TENANT_ID = '__system_admin__';
const SALE_PRODUCTS_RUNTIME_KEY = 'adisyon-sale-products';

function normalizeSnapshot(input: unknown) {
  if (!input || typeof input !== 'object') return {} as Record<string, string>;
  const state = Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
  );
  const rawSaleProducts = state[SALE_PRODUCTS_RUNTIME_KEY];
  if (!rawSaleProducts) return state;

  try {
    const parsed = JSON.parse(rawSaleProducts);
    if (!Array.isArray(parsed)) return state;
    const filtered = filterSellableProducts(parsed, 'runtime-state-sale-products');
    state[SALE_PRODUCTS_RUNTIME_KEY] = JSON.stringify(filtered);
  } catch {
    delete state[SALE_PRODUCTS_RUNTIME_KEY];
  }

  return state;
}

async function resolveScope(request: Request, scope: string) {
  if (scope === 'tenant') {
    const tenant = await requireTenant(request);
    return {
      tenantId: tenant.tenantId,
      key: 'client-runtime:tenant',
    };
  }

  if (scope === 'system-admin') {
    const session = await getSessionFromRequest(request);
    if (!(await isSessionActive(session))) {
      throw new Error('forbidden');
    }
    if (!isSuperAdmin(session)) {
      throw new Error('forbidden');
    }

    return {
      tenantId: SYSTEM_ADMIN_TENANT_ID,
      key: 'client-runtime:system-admin',
    };
  }

  throw new Error('not-found');
}

export async function GET(request: Request, context: { params: Promise<{ scope: string }> }) {
  const { scope } = await context.params;
  const startedAt = Date.now();
  let tenantId: string | undefined;

  try {
    const target = await resolveScope(request, scope);
    tenantId = target.tenantId;
    const stored = await prisma.runtimeState.findUnique({
      where: runtimeStateTenantKey(target.tenantId, target.key),
      select: { payload: true },
    });

    const response = NextResponse.json({
      ok: true,
      state: normalizeSnapshot(stored?.payload),
    });

    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'GET',
    });
    logInfo({ service: 'api.runtime.state', message: 'Runtime snapshot loaded', tenantId, route: '/api/runtime/state/[scope]' });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime state load failed';
    recordTenantError({ tenantId, message, scope: 'api.runtime.state', route: '/api/runtime/state/[scope]' });
    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'GET',
    });
    logError({ service: 'api.runtime.state', message, tenantId, route: '/api/runtime/state/[scope]' });
    if (error instanceof Error && error.message === 'forbidden') return forbiddenResponse('Forbidden');
    if (scope === 'tenant') return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ scope: string }> }) {
  const { scope } = await context.params;
  const startedAt = Date.now();
  let tenantId: string | undefined;

  try {
    const target = await resolveScope(request, scope);
    tenantId = target.tenantId;
    const body = (await request.json().catch(() => null)) as { state?: unknown } | null;
    const state = normalizeSnapshot(body?.state);

    await prisma.runtimeState.upsert({
      where: runtimeStateTenantKey(target.tenantId, target.key),
      update: { payload: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue },
      create: { tenantId: target.tenantId, key: target.key, payload: JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue },
    });

    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'POST',
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime state save failed';
    recordTenantError({ tenantId, message, scope: 'api.runtime.state', route: '/api/runtime/state/[scope]' });
    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'POST',
    });
    logError({ service: 'api.runtime.state', message, tenantId, route: '/api/runtime/state/[scope]' });
    if (error instanceof Error && error.message === 'forbidden') return forbiddenResponse('Forbidden');
    if (scope === 'tenant') return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ scope: string }> }) {
  const { scope } = await context.params;
  const startedAt = Date.now();
  let tenantId: string | undefined;

  try {
    const target = await resolveScope(request, scope);
    tenantId = target.tenantId;
    await prisma.runtimeState.delete({
      where: runtimeStateTenantKey(target.tenantId, target.key),
    }).catch(() => undefined);

    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 200,
      method: 'DELETE',
    });
    return NextResponse.json({ ok: true, state: {} });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Runtime state delete failed';
    recordTenantError({ tenantId, message, scope: 'api.runtime.state', route: '/api/runtime/state/[scope]' });
    recordRequestMetric({
      tenantId,
      route: '/api/runtime/state/[scope]',
      durationMs: Date.now() - startedAt,
      statusCode: 500,
      method: 'DELETE',
    });
    logError({ service: 'api.runtime.state', message, tenantId, route: '/api/runtime/state/[scope]' });
    if (error instanceof Error && error.message === 'forbidden') return forbiddenResponse('Forbidden');
    if (scope === 'tenant') return tenantAuthErrorResponse(error);
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }
}
