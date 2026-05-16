import { NextResponse } from 'next/server';
import { getSessionFromRequest, unauthorizedResponse } from '@/lib/session';
import { buildTenantOperationalHealth } from '@/lib/operational-intelligence/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  const health = await buildTenantOperationalHealth(session.tenantId);
  return NextResponse.json({ ok: true, health });
}
