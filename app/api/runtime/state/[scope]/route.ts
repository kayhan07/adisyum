import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { requireTenant, tenantAuthErrorResponse } from '@/lib/requireTenant';
import { getSessionFromRequest, forbiddenResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { isSessionActive } from '@/lib/server/session-guard';
import { logError, logInfo } from '@/lib/observability/structured-logger';
import { recordRequestMetric, recordTenantError } from '@/lib/observability/metrics-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SYSTEM_ADMIN_TENANT_ID = '__system_admin__';

function normalizeSnapshot(input: unknown) {
  if (!input || typeof input !== 'object') return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'),
  );
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
      where: { tenantId_key: { tenantId: target.tenantId, key: target.key } },
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
      where: { tenantId_key: { tenantId: target.tenantId, key: target.key } },
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
      where: { tenantId_key: { tenantId: target.tenantId, key: target.key } },
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
