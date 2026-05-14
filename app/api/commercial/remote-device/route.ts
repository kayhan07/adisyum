import { NextResponse } from 'next/server';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { queueRemoteDeviceCommand, type RemoteDeviceAction } from '@/lib/commercial-ops/platform';
import { isSessionActive } from '@/lib/server/session-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = new Set<RemoteDeviceAction>([
  'printer_restart',
  'bridge_restart',
  'queue_clear',
  'sync_retry',
  'device_diagnostics',
  'websocket_reconnect',
  'remote_config_push',
]);

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');
  if (!isSuperAdmin(session)) return forbiddenResponse();

  const body = await request.json().catch(() => ({})) as {
    tenantId?: string;
    action?: RemoteDeviceAction;
    deviceId?: string;
    payload?: Record<string, unknown>;
  };

  if (!body.tenantId || !body.action || !ACTIONS.has(body.action)) {
    return NextResponse.json({ ok: false, error: 'tenantId and valid action required' }, { status: 400 });
  }

  const command = queueRemoteDeviceCommand({
    tenantId: body.tenantId,
    action: body.action,
    deviceId: body.deviceId,
    payload: body.payload,
    requestedBy: session.userId ?? 'system-admin',
  });

  return NextResponse.json({ ok: true, command });
}
