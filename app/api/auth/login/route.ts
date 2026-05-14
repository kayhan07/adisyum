import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifySessionToken } from '@/lib/auth';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { writeAuditLog } from '@/lib/db/audit';
import { registerActiveSession } from '@/lib/server/session-revocation';

export const dynamic = 'force-dynamic';

const DEMO_TENANT_ID = 'ABN-48291';
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORDS = new Set(['1234', 'demo-change-me']);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    tenantId?: string;
    username?: string;
    password?: string;
  } | null;

  const tenantId = body?.tenantId?.trim();
  const username = body?.username?.trim();
  const password = body?.password;

  if (!tenantId || !username || !password) {
    return NextResponse.json({ ok: false, error: 'Tenant, kullanıcı adı ve şifre zorunludur.' }, { status: 400 });
  }

  const [tenant, subscription, user] = await Promise.all([
    prisma.tenant.findUnique({
      where: { tenantId },
      select: { tenantId: true, status: true, packageType: true, name: true, mainBranchId: true },
    }),
    prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['active', 'trial', 'demo'] },
        endsAt: { gte: new Date() },
      },
      orderBy: { endsAt: 'desc' },
      select: { id: true, packageType: true, endsAt: true },
    }),
    prisma.user.findFirst({
      where: { tenantId, username, active: true },
      select: { id: true, username: true, name: true, role: true, branchId: true, permissions: true, passwordHash: true },
    }),
  ]);

  const demoLogin = tenantId === DEMO_TENANT_ID && username.toLocaleLowerCase('tr-TR') === DEMO_USERNAME && DEMO_PASSWORDS.has(password);
  const passwordMatches = user ? user.passwordHash === password || (demoLogin && tenantId === DEMO_TENANT_ID) : demoLogin;

  if (!tenant || !subscription || !passwordMatches) {
    await writeAuditLog({
      tenantId,
      userId: user?.id ?? username,
      action: 'failed_login',
      entity: 'user',
      entityId: user?.id ?? username,
      metadata: { reason: 'invalid_credentials' },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Kullanıcı adı veya şifre hatalı.' }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: user?.id ?? `${tenantId}:${username}`,
    tenantId,
    role: user?.role ?? 'Admin',
    subscriptionId: subscription.id,
    permissions: Array.isArray(user?.permissions)
      ? user.permissions.filter((item): item is string => typeof item === 'string')
      : ['*'],
    packageType: (subscription.packageType || tenant.packageType) as 'mini' | 'gold' | 'premium',
    branchId: user?.branchId ?? tenant.mainBranchId ?? 'mrk',
  });

  await writeAuditLog({
    tenantId,
    userId: user?.id ?? username,
    action: 'login',
    entity: 'user',
    entityId: user?.id ?? username,
  }).catch(() => undefined);

  const verified = await verifySessionToken(token);
  if (verified) {
    await registerActiveSession(verified).catch(() => undefined);
  }

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}
