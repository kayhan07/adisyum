import { NextRequest, NextResponse } from 'next/server';
import { fetchKdsTickets } from '@/lib/server/kds-api';
import { getLocalKdsTickets } from '@/lib/server/kds-local';
import { getSessionFromRequest } from '@/lib/session';
import { isSessionActive } from '@/lib/server/session-guard';
import { logError } from '@/lib/observability/structured-logger';
import { recordRequestMetric, recordTenantError } from '@/lib/observability/metrics-store';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await getSessionFromRequest(request);
  if (!session || !(await isSessionActive(session))) {
    return NextResponse.json({ ok: false, error: 'Oturum sonlandirildi.' }, { status: 401 });
  }
  const tenantId = session?.tenantId;
  const { searchParams } = new URL(request.url);
  const channel = searchParams.get('channel') ?? 'kitchen';
  const branchId = searchParams.get('branchId') ?? undefined;

  try {
    const payload = await fetchKdsTickets(channel, branchId);
    recordRequestMetric({ tenantId, route: '/api/kds/tickets', durationMs: Date.now() - startedAt, statusCode: 200, method: 'GET' });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'KDS backend hatası';
    recordTenantError({ tenantId, message, scope: 'api.kds.tickets', route: '/api/kds/tickets' });
    logError({ service: 'api.kds.tickets', message, tenantId, route: '/api/kds/tickets' });
    recordRequestMetric({ tenantId, route: '/api/kds/tickets', durationMs: Date.now() - startedAt, statusCode: 200, method: 'GET' });
    const payload = getLocalKdsTickets(channel, branchId, tenantId);
    return NextResponse.json(payload, {
      headers: {
        'X-KDS-Source': 'local-fallback',
        'X-KDS-Backend-Error': message,
      },
    });
  }
}
