import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { assertActiveSubscription, tenantFromSession, type TenantContext } from '@/lib/tenant';
import { assertTenantIsActive } from '@/lib/db/tenant-repository';
import { isSessionActive } from '@/lib/server/session-guard';

export class TenantAuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

export async function requireTenant(request: Request, options: { allowSuperAdmin?: boolean } = {}): Promise<TenantContext> {
  const session = await getSessionFromRequest(request);
  if (!session) throw new TenantAuthError('Oturum dogrulanamadi.', 401);

  const active = await isSessionActive(session);
  if (!active) throw new TenantAuthError('Oturum sonlandirildi. Lutfen tekrar giris yapin.', 401);

  if (session.role === 'super_admin') {
    if (options.allowSuperAdmin) return tenantFromSession(session);
    throw new TenantAuthError('Bu endpoint tenant oturumu gerektirir.', 403);
  }

  try {
    assertActiveSubscription(session);
    await assertTenantIsActive(session.tenantId);
  } catch {
    throw new TenantAuthError('Abonelik aktif degil.', 403);
  }

  return tenantFromSession(session);
}

export function tenantAuthErrorResponse(error: unknown) {
  if (error instanceof TenantAuthError) {
    return error.status === 401 ? unauthorizedResponse(error.message) : forbiddenResponse(error.message);
  }
  return forbiddenResponse('Tenant dogrulamasi basarisiz.');
}
