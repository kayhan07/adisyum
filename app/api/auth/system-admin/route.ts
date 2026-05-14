import { NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { createSessionToken, setSessionCookie } from '@/lib/session';
import { writeAuditLog } from '@/lib/db/audit';
import { registerActiveSession } from '@/lib/server/session-revocation';

export const dynamic = 'force-dynamic';

function getExpectedPassword() {
  const password = process.env.ADISYUM_SUPER_ADMIN_PASSWORD;
  if (password) return password;
  if (process.env.NODE_ENV === 'production') return null;
  return 'admin123';
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  const expectedPassword = getExpectedPassword();

  if (!expectedPassword) {
    return NextResponse.json({ ok: false, error: 'ADISYUM_SUPER_ADMIN_PASSWORD tanimli degil.' }, { status: 503 });
  }

  if (body?.username !== 'admin' || body.password !== expectedPassword) {
    await writeAuditLog({
      tenantId: null,
      userId: body?.username ?? null,
      action: 'failed_login',
      entity: 'system_admin',
      metadata: { username: body?.username ?? null },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: 'Admin kullanici adi veya sifre hatali.' }, { status: 401 });
  }

  const token = await createSessionToken({
    userId: 'super-admin',
    tenantId: 'system',
    role: 'super_admin',
    subscriptionId: 'system',
    permissions: ['*'],
  });

  await writeAuditLog({
    tenantId: null,
    userId: 'super-admin',
    action: 'login',
    entity: 'system_admin',
  }).catch(() => undefined);

  const verified = await verifySessionToken(token);
  if (verified) {
    await registerActiveSession(verified).catch(() => undefined);
  }

  return setSessionCookie(NextResponse.json({ ok: true }), token);
}
