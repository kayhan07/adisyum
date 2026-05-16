import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin, type TenantContext } from '@/lib/tenant';
import { isSessionActive } from '@/lib/server/session-guard';

export async function requireSystemAdmin(request: Request): Promise<TenantContext> {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw unauthorizedResponse('System-admin oturumu bulunamadi.');
  }

  if (!(await isSessionActive(session))) {
    throw unauthorizedResponse('System-admin oturumu sonlandirildi.');
  }

  if (!isSuperAdmin(session)) {
    throw forbiddenResponse('Bu islem super_admin yetkisi gerektirir.');
  }

  return {
    tenantId: session.tenantId,
    userId: session.userId,
    role: session.role,
    permissions: session.permissions ?? [],
    branchId: session.branchId,
    packageType: session.packageType,
  };
}

export function isRouteResponse(error: unknown): error is Response {
  return error instanceof Response;
}
