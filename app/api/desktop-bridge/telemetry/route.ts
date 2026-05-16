import { NextResponse } from 'next/server';
import { logInfo, logWarn } from '@/lib/observability/structured-logger';
import { recordReleaseTelemetry, recordTenantError, recordTenantRealtimeHealth } from '@/lib/observability/metrics-store';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { ingestPilotDiagnostics } from '@/lib/pilot-field/field-validation';
import { isSessionActive } from '@/lib/server/session-guard';
import { trackUpdateSecurityEvent } from '@/lib/security/security-telemetry';

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
  release?: {
    version?: string;
    channel?: string;
    track?: string;
    updateStatus?: string;
    latencyMs?: number;
    rollbackCount?: number;
    outdated?: boolean;
    target?: string;
    source?: string;
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
  if (body?.tenantId && body.tenantId !== session.tenantId) {
    logWarn({
      tenantId: session.tenantId,
      service: 'desktop-bridge.telemetry',
      message: 'Rejected tenant-mismatched desktop bridge telemetry',
      context: { requestedTenantId: body.tenantId, sessionTenantId: session.tenantId, bridgeId: body.bridgeId },
    });
    return forbiddenResponse('Tenant mismatch');
  }

  const tenantId = session.tenantId;
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

  if (body?.release) {
    recordReleaseTelemetry({
      tenantId,
      releaseVersion: body.release.version,
      releaseChannel: body.release.channel,
      rolloutTrack: body.release.track,
      updateStatus: body.release.updateStatus,
      updateLatencyMs: body.release.latencyMs,
      rollbackCount: body.release.rollbackCount,
      outdated: body.release.outdated,
      releaseTarget: body.release.target,
      releaseSource: body.release.source,
    });

    const updateStatus = (body.release.updateStatus ?? '').toLowerCase();
    if (['failed-signature', 'corrupted-manifest', 'corrupted-package', 'suspicious-source', 'blocked'].includes(updateStatus)) {
      void trackUpdateSecurityEvent(
        updateStatus === 'failed-signature'
          ? 'failed_signature_validation'
          : updateStatus === 'corrupted-manifest'
            ? 'corrupted_manifest'
            : updateStatus === 'corrupted-package'
              ? 'corrupted_update_package'
              : 'suspicious_update_source',
        tenantId,
        `Update trust violation reported by desktop bridge: ${updateStatus}`,
        {
          version: body.release.version,
          channel: body.release.channel,
          track: body.release.track,
          latencyMs: body.release.latencyMs,
          source: body.release.source,
          target: body.release.target,
        },
      );
    }
  }

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
      release: body?.release,
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
