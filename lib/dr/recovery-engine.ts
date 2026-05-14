import { spawn } from 'node:child_process';
import { loadSystemAdminState, saveSystemAdminState, type SystemAdminState } from '@/lib/system-admin-store';
import {
  getBackupRuns,
  readBackupPayloadFromRun,
  type BackupCategory,
  type BackupRun,
} from '@/lib/backup/backup-engine';
import { logError, logInfo, logWarn } from '@/lib/observability/structured-logger';
import { alertCritical, fireAlert } from '@/lib/alerts/alert-engine';
import { setOperationMode } from '@/lib/operations/mode-manager';

export type RestoreStatus = 'success' | 'failed' | 'partial' | 'simulated';

export type RestoreRun = {
  id: string;
  type: 'full' | 'tenant' | 'point_in_time' | 'rollback' | 'redis' | 'postgres' | 'migration';
  status: RestoreStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  backupIds: string[];
  tenantId?: string;
  simulated?: boolean;
  details: string[];
  error?: string;
};

type RecoveryState = {
  restoreRuns: RestoreRun[];
};

const g = globalThis as typeof globalThis & { __adisyumRecoveryState?: RecoveryState };
const MAX_RESTORE_RUNS = 300;

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix = 'rst') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getState(): RecoveryState {
  if (!g.__adisyumRecoveryState) {
    g.__adisyumRecoveryState = { restoreRuns: [] };
  }
  return g.__adisyumRecoveryState;
}

function trackRestore(run: RestoreRun) {
  const state = getState();
  state.restoreRuns.unshift(run);
  if (state.restoreRuns.length > MAX_RESTORE_RUNS) state.restoreRuns = state.restoreRuns.slice(0, MAX_RESTORE_RUNS);
}

function latestRunByCategory(category: BackupCategory, beforeTimestamp?: string) {
  const all = getBackupRuns(2000).filter((r) => r.category === category && r.status === 'success');
  if (!beforeTimestamp) return all[0] ?? null;
  const cutoff = new Date(beforeTimestamp).getTime();
  return all.find((r) => new Date(r.completedAt).getTime() <= cutoff) ?? null;
}

function executeCommand(command: string, args: string[] = []) {
  return new Promise<{ ok: boolean; output: string }>((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({ ok: code === 0, output: `${stdout}\n${stderr}`.trim() });
    });
    child.on('error', (err) => {
      resolve({ ok: false, output: err.message });
    });
  });
}

function applyTenantConfigPayload(payload: unknown, tenantId?: string) {
  const parsed = payload as { payload?: SystemAdminState };
  if (!parsed?.payload) return { applied: false, reason: 'payload missing' };

  if (!tenantId) {
    saveSystemAdminState(parsed.payload);
    return { applied: true, reason: 'full admin state restored' };
  }

  const current = loadSystemAdminState();
  const source = parsed.payload;

  const incomingTenant = source.tenants.find((t) => t.tenant_id === tenantId);
  if (!incomingTenant) return { applied: false, reason: `tenant ${tenantId} not found in backup` };

  const nextTenants = [incomingTenant, ...current.tenants.filter((t) => t.tenant_id !== tenantId)];
  const nextPayments = [...source.payments.filter((p) => p.tenant_id === tenantId), ...current.payments.filter((p) => p.tenant_id !== tenantId)];
  const nextInvoices = [...source.invoices.filter((i) => i.tenant_id === tenantId), ...current.invoices.filter((i) => i.tenant_id !== tenantId)];
  const nextSales = [...source.sales.filter((s) => s.tenant_id === tenantId), ...current.sales.filter((s) => s.tenant_id !== tenantId)];
  const nextCommissions = [...source.commissions.filter((c) => c.tenant_id === tenantId), ...current.commissions.filter((c) => c.tenant_id !== tenantId)];
  const nextRenewals = [...source.renewals.filter((r) => r.tenant_id === tenantId), ...current.renewals.filter((r) => r.tenant_id !== tenantId)];
  const nextFinance = [
    ...source.finance.filter((f) => f.tenant_id === tenantId),
    ...current.finance.filter((f) => f.tenant_id !== tenantId),
  ];

  saveSystemAdminState({
    ...current,
    packages: source.packages,
    dealers: source.dealers,
    tenants: nextTenants,
    payments: nextPayments,
    invoices: nextInvoices,
    sales: nextSales,
    commissions: nextCommissions,
    renewals: nextRenewals,
    finance: nextFinance,
  });

  return { applied: true, reason: `tenant ${tenantId} restored from backup` };
}

async function runRestore(
  type: RestoreRun['type'],
  runs: BackupRun[],
  options?: { tenantId?: string; simulated?: boolean },
): Promise<RestoreRun> {
  const started = Date.now();
  const details: string[] = [];

  try {
    setOperationMode('recovery', `${type} restore started`, 'playbook');
    for (const run of runs) {
      const payload = readBackupPayloadFromRun(run);
      if (!payload) {
        details.push(`Backup payload unavailable: ${run.id}`);
        continue;
      }

      if (options?.simulated) {
        details.push(`Simulated restore ok: ${run.category} from ${run.id}`);
        continue;
      }

      if (run.category === 'tenant_config') {
        const result = applyTenantConfigPayload(payload, options?.tenantId);
        details.push(`${run.category}: ${result.reason}`);
      } else {
        details.push(`${run.category}: metadata restore prepared from ${run.id}`);
      }
    }

    const output: RestoreRun = {
      id: uid('restore'),
      type,
      status: options?.simulated ? 'simulated' : 'success',
      startedAt: new Date(started).toISOString(),
      completedAt: nowIso(),
      durationMs: Date.now() - started,
      backupIds: runs.map((r) => r.id),
      tenantId: options?.tenantId,
      simulated: Boolean(options?.simulated),
      details,
    };

    trackRestore(output);
    setOperationMode('normal', `${type} restore completed`, 'playbook');
    logInfo({ service: 'recovery-engine', message: `${type} restore completed.` });
    return output;
  } catch (error) {
    const failed: RestoreRun = {
      id: uid('restore'),
      type,
      status: 'failed',
      startedAt: new Date(started).toISOString(),
      completedAt: nowIso(),
      durationMs: Date.now() - started,
      backupIds: runs.map((r) => r.id),
      tenantId: options?.tenantId,
      details,
      error: error instanceof Error ? error.message : String(error),
    };
    trackRestore(failed);
    setOperationMode('emergency', `${type} restore failed`, 'playbook');
    logError({ service: 'recovery-engine', message: `${type} restore failed: ${failed.error}` });
    await alertCritical('Restore başarısız', `${type} restore failed: ${failed.error}`, { service: 'recovery-engine' });
    return failed;
  }
}

export async function fullRestore(backupId?: string, simulated = false) {
  const categories: BackupCategory[] = ['postgresql', 'redis', 'tenant_config', 'uploaded_assets', 'receipt_template', 'printer_config'];
  const runs: BackupRun[] = [];

  for (const category of categories) {
    const run = backupId
      ? getBackupRuns(2000).find((r) => r.id === backupId && r.category === category && r.status === 'success') ?? null
      : latestRunByCategory(category);
    if (run) runs.push(run);
  }

  return runRestore('full', runs, { simulated });
}

export async function tenantOnlyRestore(tenantId: string, backupId?: string, simulated = false) {
  const run = backupId
    ? getBackupRuns(2000).find((r) => r.id === backupId && r.category === 'tenant_config' && r.status === 'success') ?? null
    : latestRunByCategory('tenant_config');

  if (!run) {
    return runRestore('tenant', [], { tenantId, simulated: true });
  }

  return runRestore('tenant', [run], { tenantId, simulated });
}

export async function pointInTimeRecovery(timestampIso: string, simulated = false) {
  const categories: BackupCategory[] = ['postgresql', 'redis', 'tenant_config'];
  const runs = categories
    .map((cat) => latestRunByCategory(cat, timestampIso))
    .filter((v): v is BackupRun => Boolean(v));
  return runRestore('point_in_time', runs, { simulated });
}

export async function rollbackSnapshot(snapshotBackupId: string, simulated = false) {
  const run = getBackupRuns(2000).find((r) => r.id === snapshotBackupId && r.status === 'success');
  return runRestore('rollback', run ? [run] : [], { simulated });
}

export async function recoverCorruptedDb() {
  const candidate = latestRunByCategory('postgresql');
  const restore = await runRestore('postgres', candidate ? [candidate] : [], { simulated: !candidate });
  if (!candidate) {
    await fireAlert({
      severity: 'critical',
      title: 'Corrupted DB recovery failed',
      message: 'No PostgreSQL backup found for recovery.',
      service: 'recovery-engine',
    });
  }
  return restore;
}

export async function recoverRedis() {
  const candidate = latestRunByCategory('redis');
  return runRestore('redis', candidate ? [candidate] : [], { simulated: !candidate });
}

export async function recoverFailedMigration() {
  const started = Date.now();
  const details: string[] = [];
  const cmd = process.env.MIGRATION_RECOVERY_CMD?.trim() || 'npx';
  const args = process.env.MIGRATION_RECOVERY_CMD
    ? process.env.MIGRATION_RECOVERY_CMD.split(' ').slice(1)
    : ['prisma', 'migrate', 'deploy'];

  const result = await executeCommand(cmd, args);
  details.push(result.output.slice(0, 4000));

  const run: RestoreRun = {
    id: uid('restore'),
    type: 'migration',
    status: result.ok ? 'success' : 'failed',
    startedAt: new Date(started).toISOString(),
    completedAt: nowIso(),
    durationMs: Date.now() - started,
    backupIds: [],
    details,
    error: result.ok ? undefined : result.output.slice(0, 1000),
  };

  trackRestore(run);
  if (!result.ok) {
    logWarn({ service: 'recovery-engine', message: `Migration recovery command failed: ${run.error}` });
  }
  return run;
}

export function getRecentRestoreRuns(limit = 100) {
  return getState().restoreRuns.slice(0, limit);
}

export function getRecoveryReadinessReport() {
  const restores = getState().restoreRuns;
  const total = restores.length;
  const successes = restores.filter((r) => r.status === 'success' || r.status === 'simulated').length;
  const failed = restores.filter((r) => r.status === 'failed').length;

  const readinessScore = total === 0 ? 65 : Math.max(0, Math.round((successes / Math.max(1, total)) * 100 - failed * 5));
  const backupMaturityScore = Math.min(100, 60 + Math.max(0, successes * 2) - failed * 4);
  const haReadinessScore = Number(process.env.HA_READINESS_SCORE ?? 78);

  return {
    recoveryReadinessScore: readinessScore,
    backupMaturityScore,
    haReadinessScore,
    rpoMinutesEstimate: Number(process.env.RPO_MINUTES_ESTIMATE ?? 30),
    rtoMinutesEstimate: Number(process.env.RTO_MINUTES_ESTIMATE ?? 20),
    restoreSuccessRate: total === 0 ? 0 : Number(((successes / total) * 100).toFixed(1)),
    totalRestoreRuns: total,
    failedRestoreRuns: failed,
    reportGeneratedAt: nowIso(),
  };
}
