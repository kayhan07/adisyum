import { NextResponse } from 'next/server';
import { getRawSessionTokenFromRequest, getSessionFromRequest, unauthorizedResponse } from '@/lib/session';
import { findSessionByRawToken, touchDeviceHeartbeat, upsertPresence } from '@/lib/operations/live-ops';
import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseAgent(userAgent: string | null) {
  const value = userAgent ?? '';
  const browser = /Edg\//.test(value) ? 'Edge' : /Chrome\//.test(value) ? 'Chrome' : /Firefox\//.test(value) ? 'Firefox' : /Safari\//.test(value) ? 'Safari' : 'Unknown';
  const os = /Windows/.test(value) ? 'Windows' : /Android/.test(value) ? 'Android' : /iPhone|iPad/.test(value) ? 'iOS' : /Mac OS/.test(value) ? 'macOS' : /Linux/.test(value) ? 'Linux' : 'Unknown';
  const deviceType = /Android|iPhone|iPad|Mobile/.test(value) ? 'mobile' : 'desktop';
  return { browser, os, deviceType };
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const [session, rawToken] = await Promise.all([getSessionFromRequest(request), Promise.resolve(getRawSessionTokenFromRequest(request))]);
  if (!session || !rawToken) return unauthorizedResponse();
  const dbSession = await findSessionByRawToken(rawToken);
  if (!dbSession) return unauthorizedResponse('DB session bulunamadi.');
  const body = await request.json().catch(() => ({})) as {
    currentRoute?: string;
    activeTableId?: string;
    deviceId?: string;
  };
  const user = await prisma.user.findUnique({
    where: { tenantId_id: { tenantId: session.tenantId, id: session.userId } },
    select: { username: true },
  });
  const agent = parseAgent(request.headers.get('user-agent'));
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip');
  await upsertPresence({
    sessionId: dbSession.id,
    tenantId: session.tenantId,
    branchId: session.branchId,
    userId: session.userId,
    username: user?.username ?? session.userId,
    role: session.role,
    ...agent,
    ip,
    currentRoute: body.currentRoute?.slice(0, 240),
    activeTableId: body.activeTableId?.slice(0, 120),
    heartbeatLatency: Date.now() - startedAt,
  });
  await prisma.session.update({
    where: { id: dbSession.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => undefined);
  if (body.deviceId?.trim()) {
    await touchDeviceHeartbeat({
      tenantId: session.tenantId,
      branchId: session.branchId,
      deviceId: body.deviceId.trim().slice(0, 160),
      deviceType: agent.deviceType,
      latencyMs: Date.now() - startedAt,
      metadata: agent,
    });
  }
  return NextResponse.json({ ok: true, latencyMs: Date.now() - startedAt });
}
