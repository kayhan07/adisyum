import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { clearSessionCookie } from '@/lib/session';
import { prisma } from '@/lib/db/prisma';
import { userTenantIdKey } from '@/lib/db/compound-keys';
import { isSessionActive } from '@/lib/server/session-guard';
import { assertTenantIsActive } from '@/lib/db/tenant-repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const active = await isSessionActive(session);
  if (!active) {
    return clearSessionCookie(NextResponse.json({ ok: false }, { status: 401 }));
  }

  if (session.role !== 'super_admin') {
    try {
      await assertTenantIsActive(session.tenantId);
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

  const [user, tenant, subscription] = session.role === 'super_admin'
    ? [null, null, null]
    : await Promise.all([
        prisma.user.findUnique({
          where: userTenantIdKey(session.tenantId, session.userId),
          select: { username: true, name: true },
        }).catch(() => null),
        prisma.tenant.findUnique({
          where: { tenantId: session.tenantId },
          select: { name: true },
        }).catch(() => null),
        prisma.subscription.findFirst({
          where: {
            tenantId: session.tenantId,
            status: { in: ['active', 'trial', 'demo'] },
            endsAt: { gte: new Date() },
          },
          orderBy: { endsAt: 'desc' },
          select: { endsAt: true },
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
      subscriptionEndDate: subscription?.endsAt?.toISOString(),
    },
  });
}
