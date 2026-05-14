import { NextResponse } from 'next/server';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { approveSupportSession, createSupportSession } from '@/lib/commercial-ops/platform';
import { isSessionActive } from '@/lib/server/session-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');
  if (!isSuperAdmin(session)) return forbiddenResponse();

  const body = await request.json().catch(() => ({})) as {
    action?: 'create' | 'approve';
    tenantId?: string;
    sessionId?: string;
    permissions?: Array<'diagnostics' | 'remote_config' | 'screen_assist' | 'queue_control'>;
    ttlMinutes?: number;
  };

  if (body.action === 'approve') {
    if (!body.sessionId) return NextResponse.json({ ok: false, error: 'sessionId required' }, { status: 400 });
    const supportSession = approveSupportSession(body.sessionId, session.userId ?? 'system-admin');
    return NextResponse.json({ ok: Boolean(supportSession), supportSession });
  }

  if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
  const supportSession = createSupportSession({
    tenantId: body.tenantId,
    requestedBy: session.userId ?? 'system-admin',
    permissions: body.permissions,
    ttlMinutes: body.ttlMinutes,
  });

  return NextResponse.json({ ok: true, supportSession });
}
