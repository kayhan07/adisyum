import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifySessionToken } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { writeAuditLog } from '@/lib/db/audit';
import { userTenantIdKey } from '@/lib/db/compound-keys';
import { registerActiveSession } from '@/lib/server/session-revocation';
import { createDbSession } from '@/lib/server/auth-session-db';
import { recordOperationalEvent } from '@/lib/operations/live-ops';

export const dynamic = 'force-dynamic';

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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tenantId?: string;
    username?: string;
    password?: string;
  } | null;

  const tenantId = body?.tenantId?.trim();
  const username = body?.username?.trim();
  const password = body?.password;
  const ip = getRequestIp(request);
  const userAgent = request.headers.get('user-agent');

  if (!tenantId || !username || !password) {
    return NextResponse.json({ ok: false, error: 'Tenant, kullanici adi ve sifre zorunludur.' }, { status: 400 });
  }

  const [tenant, subscription, user] = await Promise.all([
    prisma.tenant.findUnique({
      where: { tenantId },
      select: { tenantId: true, status: true, packageType: true, name: true, mainBranchId: true, deletedAt: true },
    }),
    prisma.subscription.findFirst({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: { endsAt: 'desc' },
      select: { id: true, packageType: true, status: true, endsAt: true, metadata: true },
    }),
    prisma.user.findFirst({
      where: { tenantId, username, active: true, deletedAt: null },
      select: { id: true, username: true, name: true, role: true, branchId: true, permissions: true, passwordHash: true },
    }),
  ]);

  const passwordResult = user
    ? await verifyPassword(password, user.passwordHash)
    : { valid: false, needsRehash: false };

  const subscriptionAllowsLogin = subscription
    ? hasUnlimitedLicense(subscription.metadata)
      || (['active', 'trial', 'demo'].includes(subscription.status) && subscription.endsAt >= new Date())
      || tenant?.status === 'expired'
    : false;
  const tenantAllowsLogin = tenant ? !tenant.deletedAt && ['active', 'trial', 'demo', 'expired'].includes(tenant.status) : false;

  if (!tenant || !tenantAllowsLogin || !subscriptionAllowsLogin || !user || !passwordResult.valid) {
    console.warn('[auth/login] failed login diagnostic', {
      tenantId,
      username,
      tenantFound: Boolean(tenant),
      tenantStatus: tenant?.status ?? null,
      subscriptionFound: Boolean(subscription),
      userFound: Boolean(user),
      passwordHashPresent: Boolean(user?.passwordHash),
      passwordValid: passwordResult.valid,
      needsRehash: passwordResult.needsRehash,
    });

    await writeAuditLog({
      tenantId,
      userId: user?.id ?? username,
      action: 'failed_login',
      entity: 'user',
      entityId: user?.id ?? username,
      actorId: user?.id,
      ip,
      userAgent,
      metadata: {
        reason: !tenant || !subscription || !tenantAllowsLogin || !subscriptionAllowsLogin ? 'inactive_tenant_or_subscription' : 'invalid_credentials',
        username,
      },
    }).catch(() => undefined);
    await recordOperationalEvent({
      tenantId,
      userId: user?.id ?? null,
      type: 'auth.login_failed',
      severity: 'warning',
      message: `Basarisiz giris denemesi: ${username}`,
      entity: 'user',
      entityId: user?.id,
      source: 'auth.login',
      metadata: { username, ip },
    }).catch(() => undefined);

    return NextResponse.json({ ok: false, error: 'Kullanici adi veya sifre hatali.' }, { status: 401 });
  }

  const activeSubscription = subscription!;
  if (passwordResult.needsRehash) {
    await prisma.user.update({
      where: userTenantIdKey(tenantId, user.id),
      data: { passwordHash: await hashPassword(password), lastLoginAt: new Date() },
    }).catch(() => undefined);
  } else {
    await prisma.user.update({
      where: userTenantIdKey(tenantId, user.id),
      data: { lastLoginAt: new Date() },
    }).catch(() => undefined);
  }

  const branchId = user.branchId ?? tenant.mainBranchId ?? 'mrk';
  const token = await createSessionToken({
    userId: user.id,
    tenantId,
    role: user.role,
    subscriptionId: activeSubscription.id,
    permissions: normalizePermissions(user.permissions),
    packageType: normalizePackageType(activeSubscription.packageType || tenant.packageType),
    branchId,
  });

  const verified = await verifySessionToken(token);
  const dbSession = verified
    ? await createDbSession({ token, session: verified, ip, userAgent }).catch(() => null)
    : null;

  await writeAuditLog({
    tenantId,
    userId: user.id,
    action: 'login',
    entity: 'user',
    entityId: user.id,
    actorId: user.id,
    sessionId: dbSession?.id,
    branchId,
    ip,
    userAgent,
  }).catch(() => undefined);
  await recordOperationalEvent({
    tenantId,
    branchId,
    userId: user.id,
    sessionId: dbSession?.id,
    type: 'auth.login_succeeded',
    message: `${user.username} giris yapti.`,
    entity: 'user',
    entityId: user.id,
    source: 'auth.login',
    metadata: { username: user.username, ip },
  }).catch(() => undefined);

  if (verified) {
    await registerActiveSession(verified).catch(() => undefined);
  }

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}
