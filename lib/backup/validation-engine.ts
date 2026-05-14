import crypto from 'node:crypto';
import { getBackupRuns, readBackupPayloadFromRun, type BackupRun } from '@/lib/backup/backup-engine';
import { fullRestore, pointInTimeRecovery, type RestoreRun } from '@/lib/dr/recovery-engine';
import { logInfo, logWarn } from '@/lib/observability/structured-logger';

export type ValidationStatus = 'ok' | 'warn' | 'failed';

export type ValidationRun = {
  id: string;
  status: ValidationStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  checkedBackups: number;
  corruptedBackups: string[];
  restoreSimulation?: RestoreRun;
  details: string[];
};

type ValidationState = {
  runs: ValidationRun[];
  corruptionRegistry: Record<string, { detectedAt: string; reason: string }>;
};

const g = globalThis as typeof globalThis & { __adisyumBackupValidationState?: ValidationState };

function getState(): ValidationState {
  if (!g.__adisyumBackupValidationState) {
    g.__adisyumBackupValidationState = { runs: [], corruptionRegistry: {} };
  }
  return g.__adisyumBackupValidationState;
}

function uid(prefix = 'val') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function digestForPayload(payload: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function detectCorruption(run: BackupRun) {
  const payload = readBackupPayloadFromRun(run);
  if (payload === null) {
    return { corrupted: true, reason: 'backup payload unreadable or checksum mismatch' };
  }

  try {
    const digest = digestForPayload(payload);
    if (!run.checksum || run.checksum.length < 16) {
      return { corrupted: true, reason: 'missing or invalid checksum metadata' };
    }
    if (digest.length !== 64) {
      return { corrupted: true, reason: 'payload digest invalid' };
    }
    return { corrupted: false, reason: 'ok' };
  } catch (error) {
    return {
      corrupted: true,
      reason: `corruption detection threw: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function runBackupIntegrityValidation(options?: { includeSimulation?: boolean; pointInTimeIso?: string }) {
  const started = Date.now();
  const details: string[] = [];
  const state = getState();
  const runs = getBackupRuns(500);
  const corruptedBackups: string[] = [];

  for (const run of runs) {
    if (run.status !== 'success') continue;
    const scan = detectCorruption(run);
    if (scan.corrupted) {
      corruptedBackups.push(run.id);
      state.corruptionRegistry[run.id] = { detectedAt: new Date().toISOString(), reason: scan.reason };
      details.push(`Corruption: ${run.id} (${run.category}) => ${scan.reason}`);
    }
  }

  let simulation: RestoreRun | undefined;
  if (options?.includeSimulation) {
    simulation = options.pointInTimeIso
      ? await pointInTimeRecovery(options.pointInTimeIso, true)
      : await fullRestore(undefined, true);
    details.push(`Restore simulation: ${simulation.status} (${simulation.type})`);
  }

  const status: ValidationStatus =
    corruptedBackups.length === 0 ? 'ok' : corruptedBackups.length <= 2 ? 'warn' : 'failed';

  const validation: ValidationRun = {
    id: uid('validation'),
    status,
    startedAt: new Date(started).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    checkedBackups: runs.length,
    corruptedBackups,
    restoreSimulation: simulation,
    details,
  };

  state.runs.unshift(validation);
  state.runs = state.runs.slice(0, 200);

  if (status === 'ok') {
    logInfo({ service: 'backup-validation', message: 'Backup validation completed cleanly.' });
  } else {
    logWarn({ service: 'backup-validation', message: `Backup validation status: ${status}` });
  }

  return validation;
}

export function getBackupValidationRuns(limit = 50) {
  return getState().runs.slice(0, limit);
}

export function getLatestBackupValidation() {
  return getState().runs[0] ?? null;
}

export function getCorruptionRegistry() {
  return { ...getState().corruptionRegistry };
}
