import { NextResponse } from 'next/server';
import { getSessionFromRequest, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { isSessionActive } from '@/lib/server/session-guard';
import { logError, logInfo } from '@/lib/observability/structured-logger';
import { recordTenantError, recordTenantRealtimeHealth } from '@/lib/observability/metrics-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type ObservabilityIngestPayload = {
  tenantId?: string;
  websocket?: {
    connected?: boolean;
  };
  printer?: {
    onlineCount?: number;
    totalCount?: number;
    failedJobs?: number;
  };
  sync?: {
    failed?: number;
    pending?: number;
    lastError?: string;
  };
  error?: {
    message?: string;
    scope?: string;
  };
};

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');

  const body = (await request.json().catch(() => null)) as ObservabilityIngestPayload | null;
  const tenantIdFromSession = isSuperAdmin(session) ? undefined : session.tenantId;
  const tenantId = tenantIdFromSession ?? body?.tenantId;

  if (!tenantId) {
    return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
  }

  try {
    if (typeof body?.websocket?.connected === 'boolean') {
      recordTenantRealtimeHealth({
        tenantId,
        connected: body.websocket.connected,
        source: 'websocket',
      });
    }

    if (body?.printer) {
      recordTenantRealtimeHealth({
        tenantId,
        connected: true,
        source: 'printer',
        printerOnlineCount: body.printer.onlineCount,
        printerTotalCount: body.printer.totalCount,
        printerFailedJobs: body.printer.failedJobs,
      });
    }

    if (body?.sync) {
      recordTenantRealtimeHealth({
        tenantId,
        connected: true,
        source: 'sync',
        syncFailures: body.sync.failed,
        syncPending: body.sync.pending,
        lastSyncError: body.sync.lastError,
      });
    }

    if (body?.error?.message) {
      recordTenantError({
        tenantId,
        message: body.error.message,
        scope: body.error.scope ?? 'client.runtime',
      });
    }

    logInfo({
      service: 'observability.ingest',
      message: 'Tenant observability event ingested',
      tenantId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError({
      service: 'observability.ingest',
      message: error instanceof Error ? error.message : 'Ingest failed',
      tenantId,
    });

    return NextResponse.json({ ok: false, error: 'Ingest failed' }, { status: 500 });
  }
}
