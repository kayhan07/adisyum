import { NextResponse } from 'next/server';
import { logInfo, logWarn } from '@/lib/observability/structured-logger';
import { recordTenantError, recordTenantRealtimeHealth } from '@/lib/observability/metrics-store';
import { getSessionFromRequest, unauthorizedResponse } from '@/lib/session';
import { ingestPilotDiagnostics } from '@/lib/pilot-field/field-validation';
import { isSessionActive } from '@/lib/server/session-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DesktopBridgeTelemetryPayload = {
  tenantId?: string;
  bridgeId?: string;
  version?: string;
  healthScore?: number;
  websocket?: {
    cloudConnected?: boolean;
    localConnected?: boolean;
    reconnects?: number;
  };
  printers?: {
    online?: number;
    total?: number;
    failedJobs?: number;
    deadJobs?: number;
  };
  sync?: {
    pending?: number;
    failed?: number;
    dead?: number;
    lastError?: string;
  };
  devices?: {
    inventory?: Array<{
      id?: string;
      type?: string;
      vendor?: string;
      protocol?: string;
      online?: boolean;
      latencyMs?: number;
      firmwareVersion?: string;
      reconnectCount?: number;
      successRate?: number;
    }>;
    offline?: number;
    reconnectAttempts?: number;
    avgLatencyMs?: number;
  } | Record<string, unknown>;
  resources?: {
    memoryMb?: number;
    cpuPercent?: number;
  };
  error?: {
    message?: string;
    scope?: string;
  };
  pilot?: Omit<Parameters<typeof ingestPilotDiagnostics>[0], 'tenantId' | 'bridgeId'>;
};

function boundedMetric(value: unknown, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');

  const body = await request.json().catch(() => null) as DesktopBridgeTelemetryPayload | null;
  const tenantId = body?.tenantId || session.tenantId;
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
  }

  const printerTotal = boundedMetric(body?.printers?.total);
  const printerOnline = boundedMetric(body?.printers?.online);
  const syncFailed = boundedMetric(body?.sync?.failed) + boundedMetric(body?.sync?.dead);

  recordTenantRealtimeHealth({
    tenantId,
    connected: Boolean(body?.websocket?.cloudConnected ?? body?.websocket?.localConnected ?? true),
    source: 'websocket',
  });

  recordTenantRealtimeHealth({
    tenantId,
    connected: true,
    source: 'printer',
    printerOnlineCount: printerOnline,
    printerTotalCount: printerTotal,
    printerFailedJobs: boundedMetric(body?.printers?.failedJobs) + boundedMetric(body?.printers?.deadJobs),
  });

  recordTenantRealtimeHealth({
    tenantId,
    connected: true,
    source: 'sync',
    syncFailures: syncFailed,
    syncPending: boundedMetric(body?.sync?.pending),
    lastSyncError: body?.sync?.lastError,
  });

  if (body?.error?.message) {
    recordTenantError({
      tenantId,
      message: body.error.message,
      scope: body.error.scope ?? 'desktop-bridge',
    });
  }

  if (body?.pilot) {
    ingestPilotDiagnostics({
      ...body.pilot,
      tenantId,
      bridgeId: body.bridgeId,
    });
  }

  const healthScore = Number(body?.healthScore ?? 100);
  const deviceTelemetry = body?.devices && 'inventory' in body.devices
    ? {
        inventoryCount: Array.isArray(body.devices.inventory) ? body.devices.inventory.length : 0,
        offline: boundedMetric(body.devices.offline),
        reconnectAttempts: boundedMetric(body.devices.reconnectAttempts),
        avgLatencyMs: boundedMetric(body.devices.avgLatencyMs),
      }
    : body?.devices;
  const logPayload = {
    tenantId,
    service: 'desktop-bridge.telemetry',
    message: 'Desktop bridge telemetry ingested',
    context: {
      bridgeId: body?.bridgeId,
      version: body?.version,
      healthScore,
      resources: body?.resources,
      devices: deviceTelemetry,
    },
  };

  if (Number.isFinite(healthScore) && healthScore < 70) {
    logWarn(logPayload);
  } else {
    logInfo(logPayload);
  }

  return NextResponse.json({
    ok: true,
    tenantId,
    acceptedAt: new Date().toISOString(),
  });
}
