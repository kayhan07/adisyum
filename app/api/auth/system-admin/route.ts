import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { writeAuditLog } from '@/lib/db/audit';
import { branchTenantBranchKey, roleTenantKey, userTenantIdKey, userTenantUsernameKey } from '@/lib/db/compound-keys';
import { prisma } from '@/lib/db/prisma';
import { registerActiveSession } from '@/lib/server/session-revocation';
import { createDbSession } from '@/lib/server/auth-session-db';

export const dynamic = 'force-dynamic';

const SYSTEM_TENANT_ID = 'system';

function normalizePermissions(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function getRequestIp(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null;
}

async function ensureSystemAdmin(password: string) {
  const now = new Date();
  const endsAt = new Date(now);
  endsAt.setFullYear(endsAt.getFullYear() + 10);
  const passwordHash = await hashPassword(password);

  await prisma.tenant.upsert({
    where: { tenantId: SYSTEM_TENANT_ID },
    update: { status: 'active', packageType: 'premium' },
    create: {
      tenantId: SYSTEM_TENANT_ID,
      name: 'Adisyum System Administration',
      packageType: 'premium',
      status: 'active',
      mainBranchId: null,
      metadata: { bootstrap: true, system: true },
    },
  });

  await prisma.branch.upsert({
    where: branchTenantBranchKey(SYSTEM_TENANT_ID, 'system'),
    update: { active: true, name: 'System Administration' },
    create: {
      tenantId: SYSTEM_TENANT_ID,
      branchId: 'system',
      name: 'System Administration',
      code: 'system',
      active: true,
      metadata: { bootstrap: true, system: true },
    },
  });

  await prisma.tenant.update({
    where: { tenantId: SYSTEM_TENANT_ID },
    data: { mainBranchId: 'system' },
  });

  await prisma.role.upsert({
    where: roleTenantKey(SYSTEM_TENANT_ID, 'super_admin'),
    update: { name: 'Super Admin', permissions: ['*'], system: true },
    create: {
      tenantId: SYSTEM_TENANT_ID,
      key: 'super_admin',
      name: 'Super Admin',
      permissions: ['*'],
      system: true,
    },
  });

  const subscription = await prisma.subscription.findFirst({
    where: { tenantId: SYSTEM_TENANT_ID, status: { in: ['active', 'trial', 'demo'] }, endsAt: { gte: now } },
    orderBy: { endsAt: 'desc' },
    select: { id: true, packageType: true },
  });

  const activeSubscription = subscription ?? await prisma.subscription.create({
    data: {
      tenantId: SYSTEM_TENANT_ID,
      packageType: 'premium',
      status: 'active',
      startsAt: now,
      endsAt,
      seats: 1,
      branchLimit: 1,
      metadata: { bootstrap: true, system: true },
    },
    select: { id: true, packageType: true },
  });

  const user = await prisma.user.upsert({
    where: userTenantUsernameKey(SYSTEM_TENANT_ID, 'admin'),
    update: {
      active: true,
      passwordHash,
      role: 'super_admin',
      branchId: 'system',
      permissions: ['*'],
    },
    create: {
      tenantId: SYSTEM_TENANT_ID,
      username: 'admin',
      name: 'System Admin',
      passwordHash,
      role: 'super_admin',
      branchId: 'system',
      active: true,
      permissions: ['*'],
      metadata: { bootstrap: true, system: true },
    },
    select: { id: true, username: true, role: true, permissions: true, passwordHash: true, branchId: true },
  });

  return { user, subscription: activeSubscription };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  const username = body?.username?.trim();
  const password = body?.password;
  const ip = getRequestIp(request);
  const userAgent = request.headers.get('user-agent');

  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'Admin kullanici adi ve sifre zorunludur.' }, { status: 400 });
  }

  let user = await prisma.user.findFirst({
    where: { tenantId: SYSTEM_TENANT_ID, username, active: true, role: 'super_admin' },
    select: { id: true, username: true, role: true, permissions: true, passwordHash: true, branchId: true },
  });

  let passwordResult = user
    ? await verifyPassword(password, user.passwordHash)
    : { valid: false, needsRehash: false };

  const envPassword = process.env.ADISYUM_SUPER_ADMIN_PASSWORD;
  const envFallbackValid = username === 'admin' && Boolean(envPassword) && password === envPassword;

  let subscription = await prisma.subscription.findFirst({
    where: { tenantId: SYSTEM_TENANT_ID, status: { in: ['active', 'trial', 'demo'] }, endsAt: { gte: new Date() } },
    orderBy: { endsAt: 'desc' },
    select: { id: true, packageType: true },
  });

  if ((!user || !passwordResult.valid || !subscription) && envFallbackValid) {
    const ensured = await ensureSystemAdmin(password);
    user = ensured.user;
    subscription = ensured.subscription;
    passwordResult = { valid: true, needsRehash: false };
  }

  if (!passwordResult.valid && !envFallbackValid) {
    console.warn('[auth/system-admin] failed login diagnostic', {
      username,
      userFound: Boolean(user),
      subscriptionFound: Boolean(subscription),
      passwordHashPresent: Boolean(user?.passwordHash),
      passwordValid: passwordResult.valid,
      needsRehash: passwordResult.needsRehash,
      envFallbackConfigured: Boolean(envPassword),
    });

    await writeAuditLog({
      tenantId: SYSTEM_TENANT_ID,
      userId: username,
      action: 'failed_login',
      entity: 'system_admin',
      ip,
      userAgent,
      metadata: { username },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Admin kullanici adi veya sifre hatali.' }, { status: 401 });
  }

  if (!user || !subscription) {
    return NextResponse.json({ ok: false, error: 'System admin kullanicisi hazir degil.' }, { status: 503 });
  }

  if (user && passwordResult.needsRehash) {
    await prisma.user.update({
      where: userTenantIdKey(SYSTEM_TENANT_ID, user.id),
      data: { passwordHash: await hashPassword(password), lastLoginAt: new Date() },
    }).catch(() => undefined);
  } else {
    await prisma.user.update({
      where: userTenantIdKey(SYSTEM_TENANT_ID, user.id),
      data: { lastLoginAt: new Date() },
    }).catch(() => undefined);
  }

  const token = await createSessionToken({
    userId: user.id,
    tenantId: SYSTEM_TENANT_ID,
    role: 'super_admin',
    subscriptionId: subscription.id,
    permissions: normalizePermissions(user.permissions),
    packageType: 'premium',
    branchId: user.branchId ?? 'system',
  });

  const verified = await verifySessionToken(token);
  const dbSession = verified
    ? await createDbSession({ token, session: verified, ip, userAgent }).catch(() => null)
    : null;

  await writeAuditLog({
    tenantId: SYSTEM_TENANT_ID,
    userId: user.id,
    action: 'login',
    entity: 'system_admin',
    entityId: user.id,
    actorId: user.id,
    sessionId: dbSession?.id,
    branchId: user.branchId ?? 'system',
    ip,
    userAgent,
  }).catch(() => undefined);

  if (verified) {
    await registerActiveSession(verified).catch(() => undefined);
  }

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}
