import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { createSessionToken, setSessionCookie, clearSessionCookie } from '@/lib/session';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { registerActiveSession, revokeCurrentSession, revokeTenantSessions, revokeUserSessions } from '@/lib/server/session-revocation';
import { getSessionFromRequest, getRawSessionTokenFromRequest } from '@/lib/session';

export const dynamic = 'force-dynamic';

type LoginPayload = {
  userId?: string;
  tenantId?: string;
  role?: string;
  branchId?: string;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginPayload | null;
  if (!body?.userId || !body.tenantId || !body.role) {
    return NextResponse.json({ ok: false, error: 'Gecersiz oturum payload.' }, { status: 400 });
  }

  const [tenant, subscription, user] = await Promise.all([
    prisma.tenant.findUnique({
      where: { tenantId: body.tenantId },
      select: { tenantId: true, status: true, packageType: true },
    }),
    prisma.subscription.findFirst({
      where: {
        tenantId: body.tenantId,
        status: { in: ['active', 'trial', 'demo'] },
        endsAt: { gte: new Date() },
      },
      orderBy: { endsAt: 'desc' },
      select: { id: true, packageType: true },
    }),
    prisma.user.findFirst({
      where: { tenantId: body.tenantId, id: body.userId, active: true },
      select: { id: true, permissions: true },
    }),
  ]);

  if (!tenant || !['active', 'trial', 'demo'].includes(tenant.status) || !subscription || !user) {
    await writeAuditLog({
      tenantId: body.tenantId,
      userId: body.userId,
      action: 'failed_login',
      entity: 'user',
      entityId: body.userId,
      metadata: { reason: 'inactive_tenant_subscription_or_user' },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Tenant, abonelik veya kullanici aktif degil.' }, { status: 403 });
  }

  const token = await createSessionToken({
    userId: body.userId,
    tenantId: body.tenantId,
    role: body.role,
    subscriptionId: subscription.id,
    permissions: Array.isArray(user.permissions) ? user.permissions.filter((item): item is string => typeof item === 'string') : [],
    packageType: (subscription.packageType || tenant.packageType) as 'mini' | 'gold' | 'premium',
    branchId: body.branchId,
  });

  await writeAuditLog({
    tenantId: body.tenantId,
    userId: body.userId,
    action: 'login',
    entity: 'user',
    entityId: body.userId,
  }).catch(() => undefined);

  const verified = await verifySessionToken(token);
  if (verified) {
    await registerActiveSession(verified).catch(() => undefined);
  }

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    reason?: 'manual' | 'idle' | 'shift_end' | 'forced' | 'token_revoked';
    scope?: 'current' | 'user' | 'tenant';
  } | null;

  const reason = body?.reason ?? 'manual';
  const scope = body?.scope ?? 'current';
  const session = await getSessionFromRequest(request);
  const rawToken = getRawSessionTokenFromRequest(request);

  if (session) {
    if (scope === 'tenant') {
      await revokeTenantSessions({
        tenantId: session.tenantId,
        reason,
        actorUserId: session.userId,
        exceptSid: undefined,
      }).catch(() => undefined);
    } else if (scope === 'user') {
      await revokeUserSessions({
        tenantId: session.tenantId,
        userId: session.userId,
        reason,
        actorUserId: session.userId,
      }).catch(() => undefined);
    } else {
      await revokeCurrentSession({
        tenantId: session.tenantId,
        sid: session.sid,
        reason,
        actorUserId: session.userId,
      }).catch(() => undefined);
    }

    await writeAuditLog({
      tenantId: session.tenantId,
      userId: session.userId,
      action: 'logout',
      entity: 'user',
      entityId: session.userId,
      metadata: {
        reason,
        scope,
        sid: session.sid,
        tokenPresent: Boolean(rawToken),
      },
    }).catch(() => undefined);
  }

  return clearSessionCookie(NextResponse.json({ ok: true, reason, scope }));
}
