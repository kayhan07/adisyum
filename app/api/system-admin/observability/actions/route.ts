import { NextResponse } from 'next/server';
import { getSessionFromRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/session';
import { isSuperAdmin } from '@/lib/tenant';
import { isSessionActive } from '@/lib/server/session-guard';
import { acknowledgeIncident, manuallyResolveIncident } from '@/lib/incidents/incident-engine';
import { resolveAnomaly } from '@/lib/anomaly/detector';
import { clearDeadLetterQueue } from '@/lib/queue/enterprise-queue';
import { unblockIp } from '@/lib/security/security-telemetry';
import { runBackup, runScheduledBackups } from '@/lib/backup/backup-engine';
import { fullRestore, tenantOnlyRestore, pointInTimeRecovery, rollbackSnapshot, recoverFailedMigration } from '@/lib/dr/recovery-engine';
import { runBackupIntegrityValidation } from '@/lib/backup/validation-engine';
import { setOperationMode } from '@/lib/operations/mode-manager';
import { runPostgresOutagePlaybook, runRedisOutagePlaybook } from '@/lib/incidents/dr-playbooks';
import { disablePilotTenant, enablePilotTenant, recordChaosResult } from '@/lib/pilot-field/field-validation';
import { approveSupportSession, createSupportSession, provisionRestaurant, queueRemoteDeviceCommand, upsertLicense } from '@/lib/commercial-ops/platform';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request);
  if (!session) return unauthorizedResponse();
  if (!(await isSessionActive(session))) return unauthorizedResponse('Oturum sonlandirildi.');
  if (!isSuperAdmin(session)) return forbiddenResponse();

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    incidentId?: string;
    anomalyId?: string;
    queue?: string;
    tenantId?: string;
    ip?: string;
    backupCategory?: string;
    backupMode?: string;
    backupId?: string;
    timestampIso?: string;
    operationMode?: string;
    operationModeReason?: string;
    includeSimulation?: boolean;
    restaurantName?: string;
    chaosScenario?: string;
    packageType?: string;
    dealerId?: string;
    trialDays?: number;
    remoteAction?: string;
    deviceId?: string;
    supportSessionId?: string;
    licenseStatus?: string;
  };

  switch (body.action) {
    case 'acknowledge_incident':
      if (body.incidentId) acknowledgeIncident(body.incidentId);
      return NextResponse.json({ ok: true });

    case 'resolve_incident':
      if (body.incidentId) manuallyResolveIncident(body.incidentId);
      return NextResponse.json({ ok: true });

    case 'resolve_anomaly':
      if (body.anomalyId) resolveAnomaly(body.anomalyId);
      return NextResponse.json({ ok: true });

    case 'clear_dead_queue':
      if (body.queue) {
        const cleared = clearDeadLetterQueue(body.queue as import('@/lib/queue/enterprise-queue').QueueName, body.tenantId);
        return NextResponse.json({ ok: true, cleared });
      }
      return NextResponse.json({ ok: false, error: 'queue required' }, { status: 400 });

    case 'unblock_ip':
      if (body.ip) unblockIp(body.ip);
      return NextResponse.json({ ok: true });

    // ─── BACKUP ───────────────────────────────────────────────────────────────
    case 'run_backup': {
      const cat = (body.backupCategory ?? 'tenant_config') as import('@/lib/backup/backup-engine').BackupCategory;
      const mode = (body.backupMode ?? 'incremental') as import('@/lib/backup/backup-engine').BackupMode;
      const run = await runBackup(cat, mode);
      return NextResponse.json({ ok: true, run });
    }

    case 'run_full_backup': {
      const runs = await runScheduledBackups('full');
      return NextResponse.json({ ok: true, runCount: runs.length });
    }

    case 'run_incremental_backup': {
      const runs = await runScheduledBackups('incremental');
      return NextResponse.json({ ok: true, runCount: runs.length });
    }

    // ─── DR ───────────────────────────────────────────────────────────────────
    case 'full_restore': {
      const result = await fullRestore(body.backupId, true); // simulated by default from UI
      return NextResponse.json({ ok: true, result });
    }

    case 'tenant_restore': {
      if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
      const result = await tenantOnlyRestore(body.tenantId, body.backupId, true);
      return NextResponse.json({ ok: true, result });
    }

    case 'pitr': {
      if (!body.timestampIso) return NextResponse.json({ ok: false, error: 'timestampIso required' }, { status: 400 });
      const result = await pointInTimeRecovery(body.timestampIso, true);
      return NextResponse.json({ ok: true, result });
    }

    case 'rollback': {
      if (!body.backupId) return NextResponse.json({ ok: false, error: 'backupId required' }, { status: 400 });
      const result = await rollbackSnapshot(body.backupId, true);
      return NextResponse.json({ ok: true, result });
    }

    case 'recover_migration': {
      const result = await recoverFailedMigration();
      return NextResponse.json({ ok: true, result });
    }

    // ─── VALIDATION ───────────────────────────────────────────────────────────
    case 'validate_backups': {
      const result = await runBackupIntegrityValidation({
        includeSimulation: Boolean(body.includeSimulation),
      });
      return NextResponse.json({ ok: true, result });
    }

    // ─── OPERATION MODE ───────────────────────────────────────────────────────
    case 'set_operation_mode': {
      if (!body.operationMode) return NextResponse.json({ ok: false, error: 'operationMode required' }, { status: 400 });
      const snapshot = setOperationMode(
        body.operationMode as import('@/lib/operations/mode-manager').OperationMode,
        body.operationModeReason ?? 'Manual override by admin',
        'admin',
      );
      return NextResponse.json({ ok: true, snapshot });
    }

    // ─── PLAYBOOKS ─────────────────────────────────────────────────────────────
    case 'run_postgres_outage_playbook': {
      const result = await runPostgresOutagePlaybook();
      return NextResponse.json({ ok: true, result });
    }

    case 'run_redis_outage_playbook': {
      const result = await runRedisOutagePlaybook();
      return NextResponse.json({ ok: true, result });
    }

    case 'enable_pilot_tenant': {
      if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
      const config = enablePilotTenant({ tenantId: body.tenantId, restaurantName: body.restaurantName });
      return NextResponse.json({ ok: true, config });
    }

    case 'disable_pilot_tenant': {
      if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
      const config = disablePilotTenant(body.tenantId);
      return NextResponse.json({ ok: true, config });
    }

    case 'record_pilot_chaos_result': {
      if (!body.tenantId || !body.chaosScenario) {
        return NextResponse.json({ ok: false, error: 'tenantId and chaosScenario required' }, { status: 400 });
      }
      const event = recordChaosResult({
        tenantId: body.tenantId,
        scenario: body.chaosScenario,
        passed: true,
        durationMs: 0,
        recoveryMs: 0,
      });
      return NextResponse.json({ ok: true, event });
    }

    case 'provision_restaurant': {
      if (!body.restaurantName) return NextResponse.json({ ok: false, error: 'restaurantName required' }, { status: 400 });
      const provisioned = provisionRestaurant({
        restaurantName: body.restaurantName,
        packageType: (body.packageType ?? 'gold') as 'mini' | 'gold' | 'premium',
        dealerId: body.dealerId,
        trialDays: body.trialDays,
        tenantId: body.tenantId,
      });
      return NextResponse.json({ ok: true, provisioned });
    }

    case 'remote_device_command': {
      if (!body.tenantId || !body.remoteAction) {
        return NextResponse.json({ ok: false, error: 'tenantId and remoteAction required' }, { status: 400 });
      }
      const command = queueRemoteDeviceCommand({
        tenantId: body.tenantId,
        action: body.remoteAction as import('@/lib/commercial-ops/platform').RemoteDeviceAction,
        deviceId: body.deviceId,
        requestedBy: session.userId ?? 'system-admin',
      });
      return NextResponse.json({ ok: true, command });
    }

    case 'create_support_session': {
      if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
      const supportSession = createSupportSession({ tenantId: body.tenantId, requestedBy: session.userId ?? 'system-admin' });
      return NextResponse.json({ ok: true, supportSession });
    }

    case 'approve_support_session': {
      if (!body.supportSessionId) return NextResponse.json({ ok: false, error: 'supportSessionId required' }, { status: 400 });
      const supportSession = approveSupportSession(body.supportSessionId, session.userId ?? 'system-admin');
      return NextResponse.json({ ok: Boolean(supportSession), supportSession });
    }

    case 'update_license': {
      if (!body.tenantId) return NextResponse.json({ ok: false, error: 'tenantId required' }, { status: 400 });
      const license = upsertLicense({
        tenantId: body.tenantId,
        packageType: body.packageType as 'mini' | 'gold' | 'premium' | undefined,
        status: body.licenseStatus as import('@/lib/commercial-ops/platform').LicenseStatus | undefined,
      });
      return NextResponse.json({ ok: true, license });
    }

    default:
      return NextResponse.json({ ok: false, error: 'Unknown action' }, { status: 400 });
  }
}
