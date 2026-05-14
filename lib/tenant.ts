import type { SessionPayload } from '@/lib/auth';

export type TenantContext = {
  tenantId: string;
  userId: string;
  role: string;
  permissions: string[];
  branchId?: string;
  packageType?: 'mini' | 'gold' | 'premium';
};

export function tenantFromSession(session: SessionPayload): TenantContext {
  return {
    tenantId: session.tenantId,
    userId: session.userId,
    role: session.role,
    permissions: session.permissions ?? [],
    branchId: session.branchId,
    packageType: session.packageType,
  };
}

export function isSuperAdmin(session: Pick<SessionPayload, 'role'> | null | undefined) {
  return session?.role === 'super_admin';
}

export function hasPermission(session: Pick<SessionPayload, 'permissions' | 'role'>, permission: string) {
  if (session.role === 'super_admin') return true;
  return session.permissions.includes(permission);
}

export function assertActiveSubscription(session: SessionPayload) {
  if (!session.subscriptionId && session.role !== 'super_admin') {
    throw new Error('Tenant subscription is missing.');
  }
  return true;
}
