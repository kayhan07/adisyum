import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { clearSessionCookie } from '@/lib/session';
import { prisma } from '@/lib/db/prisma';
import { userTenantIdKey } from '@/lib/db/compound-keys';
import { isSessionActive } from '@/lib/server/session-guard';
import { assertTenantCanAccess } from '@/lib/db/tenant-repository';

export const dynamic = 'force-dynamic';

function metadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const active = await isSessionActive(session);
  if (!active) {
    return clearSessionCookie(NextResponse.json({ ok: false }, { status: 401 }));
  }

  if (session.role !== 'super_admin') {
    try {
      await assertTenantCanAccess(session.tenantId, { readOnly: true });
    } catch (error) {
      console.warn('[auth/me] stale tenant session rejected', {
        tenantId: session.tenantId,
        userId: session.userId,
        role: session.role,
        branchId: session.branchId,
        subscriptionId: session.subscriptionId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return clearSessionCookie(NextResponse.json({
        ok: false,
        error: 'Tenant oturumu gecersiz. Lutfen tekrar giris yapin.',
        code: 'stale_tenant_session',
      }, { status: 401 }));
    }
  }

  const [user, tenant, subscription, branch] = session.role === 'super_admin'
    ? [null, null, null, null]
    : await Promise.all([
        prisma.user.findUnique({
          where: userTenantIdKey(session.tenantId, session.userId),
          select: { username: true, name: true },
        }).catch(() => null),
        prisma.tenant.findUnique({
          where: { tenantId: session.tenantId },
          select: { name: true, legalName: true, taxNumber: true, metadata: true },
        }).catch(() => null),
        prisma.subscription.findFirst({
          where: {
            tenantId: session.tenantId,
            deletedAt: null,
          },
          orderBy: { endsAt: 'desc' },
          select: { endsAt: true },
        }).catch(() => null),
        prisma.branch.findUnique({
          where: { tenantId_branchId: { tenantId: session.tenantId, branchId: session.branchId || 'mrk' } },
          select: { name: true },
        }).catch(() => null),
      ]);

  return NextResponse.json({
    ok: true,
    session: {
      userId: session.userId,
      tenantId: session.tenantId,
      role: session.role,
      permissions: session.permissions,
      branchId: session.branchId,
      packageType: session.packageType,
      username: user?.username,
      name: user?.name,
      tenantName: tenant?.name,
      companyProfile: tenant ? {
        tradeName: tenant.legalName || tenant.name,
        branchName: branch?.name || 'Merkez Şube',
        taxOffice: metadataString(tenant.metadata, 'taxOffice'),
        taxNumber: tenant.taxNumber,
        phone: metadataString(tenant.metadata, 'phone'),
        email: metadataString(tenant.metadata, 'email'),
        address: metadataString(tenant.metadata, 'address'),
      } : undefined,
      subscriptionEndDate: subscription?.endsAt?.toISOString(),
    },
  });
}
