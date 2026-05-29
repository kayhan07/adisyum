import { NextResponse } from 'next/server';
import { forbiddenResponse, getSessionFromRequest } from '@/lib/session';
import { tenantFromSession, type TenantContext } from '@/lib/tenant';
import { assertTenantCanAccess } from '@/lib/db/tenant-repository';
import { isSessionActive } from '@/lib/server/session-guard';

export class TenantAuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401,
    public code = status === 401 ? 'tenant_unauthorized' : 'tenant_forbidden',
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function requestPath(request: Request) {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

function logTenantRejection(request: Request, reason: string, status: 401 | 403, details: Record<string, unknown>) {
  console.warn('[tenant-auth] rejected', {
    timestamp: new Date().toISOString(),
    path: requestPath(request),
    reason,
    status,
    ...details,
  });
}

export async function requireTenant(request: Request, options: { allowSuperAdmin?: boolean } = {}): Promise<TenantContext> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    logTenantRejection(request, 'missing_or_invalid_session_cookie', 401, {
      cookiePresent: Boolean(request.headers.get('cookie')),
    });
    throw new TenantAuthError('Oturum dogrulanamadi.', 401, 'missing_session');
  }

  const active = await isSessionActive(session);
  if (!active) {
    logTenantRejection(request, 'inactive_session_token', 401, {
      userId: session.userId,
      sessionTenantId: session.tenantId,
      role: session.role,
      branchId: session.branchId,
    });
    throw new TenantAuthError('Oturum sonlandirildi. Lutfen tekrar giris yapin.', 401, 'inactive_session', {
      tenantId: session.tenantId,
      role: session.role,
    });
  }

  if (session.role === 'super_admin') {
    if (options.allowSuperAdmin) return tenantFromSession(session);
    logTenantRejection(request, 'super_admin_session_on_tenant_endpoint', 403, {
      userId: session.userId,
      sessionTenantId: session.tenantId,
      role: session.role,
      branchId: session.branchId,
    });
    throw new TenantAuthError('Bu endpoint tenant oturumu gerektirir.', 403, 'super_admin_forbidden', {
      tenantId: session.tenantId,
      role: session.role,
    });
  }

  try {
    await assertTenantCanAccess(session.tenantId, { readOnly: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) });
  } catch (error) {
    logTenantRejection(request, 'inactive_tenant_or_subscription', 403, {
      userId: session.userId,
      sessionTenantId: session.tenantId,
      role: session.role,
      branchId: session.branchId,
      subscriptionId: session.subscriptionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TenantAuthError('Abonelik aktif degil.', 403, 'inactive_subscription', {
      tenantId: session.tenantId,
      role: session.role,
      branchId: session.branchId,
      subscriptionId: session.subscriptionId,
    });
  }

  return tenantFromSession(session);
}

export function tenantAuthErrorResponse(error: unknown) {
  if (error instanceof TenantAuthError) {
    return NextResponse.json({
      ok: false,
      error: error.message,
      code: error.code,
      details: error.details,
    }, { status: error.status });
  }
  return forbiddenResponse('Tenant dogrulamasi basarisiz.');
}
