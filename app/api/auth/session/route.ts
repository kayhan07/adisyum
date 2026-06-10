import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { createSessionToken, setSessionCookie, clearSessionCookie } from '@/lib/session';
import { prisma } from '@/lib/db/prisma';
import { writeAuditLog } from '@/lib/db/audit';
import { userTenantIdKey } from '@/lib/db/compound-keys';
import { registerActiveSession, revokeCurrentSession, revokeTenantSessions, revokeUserSessions } from '@/lib/server/session-revocation';
import { getSessionFromRequest, getRawSessionTokenFromRequest } from '@/lib/session';
import { createDbSession } from '@/lib/server/auth-session-db';

export const dynamic = 'force-dynamic';

type LoginPayload = {
  userId?: string;
  tenantId?: string;
  role?: string;
  branchId?: string;
};

function normalizePermissions(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizePackageType(value: string | null | undefined) {
  return value === 'gold' || value === 'premium' ? value : 'mini';
}

function hasUnlimitedLicense(metadata: unknown) {
  return Boolean(metadata && typeof metadata === 'object' && !Array.isArray(metadata) && (metadata as Record<string, unknown>).unlimitedLicense === true);
}

function getRequestIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
}

function isSessionBootstrapAllowed(request: Request) {
  const secret = process.env.INTERNAL_SESSION_BOOTSTRAP_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('x-internal-secret')?.trim();
  return Boolean(header) && header === secret;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  if (!isSessionBootstrapAllowed(request)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as LoginPayload | null;
  const ip = getRequestIp(request);
  const userAgent = request.headers.get('user-agent');
  if (!body?.userId || !body.tenantId || !body.role) {
    return NextResponse.json({ ok: false, error: 'Gecersiz oturum payload.' }, { status: 400 });
  }

  const [tenant, subscription, user] = await Promise.all([
    prisma.tenant.findUnique({
      where: { tenantId: body.tenantId },
      select: { tenantId: true, status: true, packageType: true, deletedAt: true },
    }),
    prisma.subscription.findFirst({
      where: {
        tenantId: body.tenantId,
        deletedAt: null,
      },
      orderBy: { endsAt: 'desc' },
      select: { id: true, packageType: true, status: true, endsAt: true, metadata: true },
    }),
    prisma.user.findUnique({
      where: userTenantIdKey(body.tenantId, body.userId),
      select: { id: true, role: true, branchId: true, permissions: true, active: true, deletedAt: true },
    }),
  ]);

  const subscriptionAllowsLogin = subscription
    ? hasUnlimitedLicense(subscription.metadata)
      || (['active', 'trial', 'demo'].includes(subscription.status) && subscription.endsAt >= new Date())
      || tenant?.status === 'expired'
    : false;
  const tenantAllowsLogin = tenant ? !tenant.deletedAt && ['active', 'trial', 'demo', 'expired'].includes(tenant.status) : false;

  if (!tenant || !tenantAllowsLogin || !subscriptionAllowsLogin || !user || !user.active || user.deletedAt) {
    await writeAuditLog({
      tenantId: body.tenantId,
      userId: body.userId,
      action: 'failed_login',
      entity: 'user',
      entityId: body.userId,
      actorId: body.userId,
      ip,
      userAgent,
      metadata: { reason: 'inactive_tenant_subscription_or_user' },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Tenant, abonelik veya kullanici aktif degil.' }, { status: 403 });
  }

  const activeSubscription = subscription!;
  const token = await createSessionToken({
    userId: body.userId,
    tenantId: body.tenantId,
    role: user.role || body.role,
    subscriptionId: activeSubscription.id,
    permissions: normalizePermissions(user.permissions),
    packageType: normalizePackageType(activeSubscription.packageType || tenant.packageType),
    branchId: user.branchId ?? body.branchId,
  });

  const verified = await verifySessionToken(token);
  const dbSession = verified
    ? await createDbSession({ token, session: verified, ip, userAgent }).catch(() => null)
    : null;

  await writeAuditLog({
    tenantId: body.tenantId,
    userId: body.userId,
    action: 'login',
    entity: 'user',
    entityId: body.userId,
    actorId: body.userId,
    sessionId: dbSession?.id,
    branchId: user.branchId ?? body.branchId ?? null,
    ip,
    userAgent,
  }).catch(() => undefined);

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
      actorId: session.userId,
      branchId: session.branchId ?? null,
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
