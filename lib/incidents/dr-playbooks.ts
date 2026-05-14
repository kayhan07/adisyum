import { setOperationMode } from '@/lib/operations/mode-manager';
import { recoverCorruptedDb, recoverRedis, type RestoreRun } from '@/lib/dr/recovery-engine';
import { fireAlert } from '@/lib/alerts/alert-engine';
import { logInfo, logWarn } from '@/lib/observability/structured-logger';

type PlaybookType = 'postgres_outage' | 'redis_outage';
type PlaybookStatus = 'success' | 'failed' | 'partial';

export type PlaybookRun = {
  id: string;
  type: PlaybookType;
  status: PlaybookStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  actions: string[];
  restore?: RestoreRun;
  error?: string;
};

type PlaybookState = {
  runs: PlaybookRun[];
};

const g = globalThis as typeof globalThis & { __adisyumPlaybookState?: PlaybookState };

function getState(): PlaybookState {
  if (!g.__adisyumPlaybookState) {
    g.__adisyumPlaybookState = { runs: [] };
  }
  return g.__adisyumPlaybookState;
}

function uid(prefix = 'playbook') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function runPlaybook(type: PlaybookType, runner: () => Promise<RestoreRun>) {
  const started = Date.now();
  const actions: string[] = [];

  try {
    setOperationMode('degraded', `${type} detected`, 'playbook');
    actions.push('operation mode => degraded');

    await fireAlert({
      severity: 'critical',
      title: `${type} incident`,
      message: `${type} playbook triggered.`,
      service: 'dr-playbooks',
    });
    actions.push('critical incident alert emitted');

    setOperationMode('recovery', `${type} recovery in progress`, 'playbook');
    actions.push('operation mode => recovery');

    const restore = await runner();
    actions.push(`recovery run status: ${restore.status}`);

    const status: PlaybookStatus = restore.status === 'success' ? 'success' : restore.status === 'partial' ? 'partial' : 'failed';

    setOperationMode(status === 'success' ? 'normal' : 'emergency', `${type} playbook finished with ${status}`, 'playbook');
    actions.push(`operation mode => ${status === 'success' ? 'normal' : 'emergency'}`);

    const result: PlaybookRun = {
      id: uid(),
      type,
      status,
      startedAt: new Date(started).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      actions,
      restore,
    };

    const state = getState();
    state.runs.unshift(result);
    state.runs = state.runs.slice(0, 200);

    logInfo({ service: 'dr-playbooks', message: `${type} playbook completed with ${status}` });
    return result;
  } catch (error) {
    const result: PlaybookRun = {
      id: uid(),
      type,
      status: 'failed',
      startedAt: new Date(started).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      actions,
      error: error instanceof Error ? error.message : String(error),
    };

    const state = getState();
    state.runs.unshift(result);
    state.runs = state.runs.slice(0, 200);

    setOperationMode('emergency', `${type} playbook failed`, 'playbook');
    logWarn({ service: 'dr-playbooks', message: `${type} playbook failed: ${result.error}` });
    return result;
  }
}

export async function runPostgresOutagePlaybook() {
  return runPlaybook('postgres_outage', async () => recoverCorruptedDb());
}

export async function runRedisOutagePlaybook() {
  return runPlaybook('redis_outage', async () => recoverRedis());
}

export function getPlaybookRuns(limit = 50) {
  return getState().runs.slice(0, limit);
}
