import { NextRequest, NextResponse } from 'next/server';
import type { KdsStatus } from '@/lib/kds-types';
import { updateKdsTicketStatus } from '@/lib/server/kds-api';
import { updateLocalKdsTicketStatus } from '@/lib/server/kds-local';
import { getSessionFromRequest } from '@/lib/session';
import { isSessionActive } from '@/lib/server/session-guard';
import { logError } from '@/lib/observability/structured-logger';
import { recordRequestMetric, recordTenantError } from '@/lib/observability/metrics-store';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ticketId: string }> },
) {
  const startedAt = Date.now();
  const session = await getSessionFromRequest(request);
  if (!session || !(await isSessionActive(session))) {
    return NextResponse.json({ ok: false, error: 'Oturum sonlandirildi.' }, { status: 401 });
  }
  const tenantId = session?.tenantId;
  const { ticketId } = await context.params;
  const payload = (await request.json().catch(() => null)) as { status?: KdsStatus; branchId?: string } | null;

  if (!payload?.status) {
    recordRequestMetric({ tenantId, route: '/api/kds/tickets/[ticketId]/status', durationMs: Date.now() - startedAt, statusCode: 422, method: 'PATCH' });
    return NextResponse.json({ message: 'Yeni durum zorunludur.' }, { status: 422 });
  }

  try {
    const ticket = await updateKdsTicketStatus(ticketId, payload.status, payload.branchId);
    recordRequestMetric({ tenantId, route: '/api/kds/tickets/[ticketId]/status', durationMs: Date.now() - startedAt, statusCode: 200, method: 'PATCH' });
    return NextResponse.json(ticket);
  } catch (error) {
    try {
      const backendMessage = error instanceof Error ? error.message : 'KDS backend hatası';
      recordTenantError({ tenantId, message: backendMessage, scope: 'api.kds.status', route: '/api/kds/tickets/[ticketId]/status' });
      logError({ service: 'api.kds.status', message: backendMessage, tenantId, route: '/api/kds/tickets/[ticketId]/status' });
      const ticket = updateLocalKdsTicketStatus(ticketId, payload.status, payload.branchId);
      recordRequestMetric({ tenantId, route: '/api/kds/tickets/[ticketId]/status', durationMs: Date.now() - startedAt, statusCode: 200, method: 'PATCH' });
      return NextResponse.json(ticket, {
        headers: {
          'X-KDS-Source': 'local-fallback',
          'X-KDS-Backend-Error': backendMessage,
        },
      });
    } catch (localError) {
      const message = localError instanceof Error ? localError.message : 'KDS durumu güncellenemedi.';
      recordTenantError({ tenantId, message, scope: 'api.kds.status', route: '/api/kds/tickets/[ticketId]/status' });
      recordRequestMetric({ tenantId, route: '/api/kds/tickets/[ticketId]/status', durationMs: Date.now() - startedAt, statusCode: 500, method: 'PATCH' });
      return NextResponse.json({ message }, { status: 500 });
    }
  }
}
