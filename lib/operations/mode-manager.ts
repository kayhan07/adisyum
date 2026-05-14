import { logInfo, logWarn } from '@/lib/observability/structured-logger';

export type OperationMode = 'normal' | 'degraded' | 'emergency' | 'maintenance' | 'recovery';

export type OperationModeEvent = {
  at: string;
  from: OperationMode;
  to: OperationMode;
  reason: string;
  actor: 'system' | 'admin' | 'playbook';
};

type OperationModeState = {
  mode: OperationMode;
  reason: string;
  changedAt: string;
  history: OperationModeEvent[];
  readOnly: boolean;
  queueWrites: boolean;
};

const MAX_HISTORY = 200;

const g = globalThis as typeof globalThis & {
  __adisyumOperationMode?: OperationModeState;
};

function nowIso() {
  return new Date().toISOString();
}

function getState(): OperationModeState {
  if (!g.__adisyumOperationMode) {
    g.__adisyumOperationMode = {
      mode: 'normal',
      reason: 'Initial boot',
      changedAt: nowIso(),
      history: [],
      readOnly: false,
      queueWrites: false,
    };
  }
  return g.__adisyumOperationMode;
}

export function setOperationMode(
  nextMode: OperationMode,
  reason: string,
  actor: OperationModeEvent['actor'] = 'system',
) {
  const state = getState();
  const prevMode = state.mode;

  if (prevMode === nextMode && state.reason === reason) return state;

  state.mode = nextMode;
  state.reason = reason;
  state.changedAt = nowIso();

  if (nextMode === 'emergency' || nextMode === 'recovery') {
    state.readOnly = true;
    state.queueWrites = true;
  }

  if (nextMode === 'normal') {
    state.readOnly = false;
    state.queueWrites = false;
  }

  const ev: OperationModeEvent = {
    at: state.changedAt,
    from: prevMode,
    to: nextMode,
    reason,
    actor,
  };
  state.history.unshift(ev);
  if (state.history.length > MAX_HISTORY) state.history = state.history.slice(0, MAX_HISTORY);

  const logger = nextMode === 'normal' ? logInfo : logWarn;
  logger({ service: 'ops-mode', message: `Mode changed ${prevMode} -> ${nextMode}: ${reason}` });

  return state;
}

export function setReadOnlyMode(enabled: boolean, reason = 'manual', actor: OperationModeEvent['actor'] = 'system') {
  const state = getState();
  state.readOnly = enabled;
  if (enabled && state.mode === 'normal') setOperationMode('degraded', reason, actor);
  if (!enabled && state.mode === 'degraded' && !state.queueWrites) setOperationMode('normal', 'Read-only disabled', actor);
  return state;
}

export function setQueueWritesMode(enabled: boolean, reason = 'manual', actor: OperationModeEvent['actor'] = 'system') {
  const state = getState();
  state.queueWrites = enabled;
  if (enabled && state.mode === 'normal') setOperationMode('degraded', reason, actor);
  if (!enabled && state.mode === 'degraded' && !state.readOnly) setOperationMode('normal', 'Queue-write mode disabled', actor);
  return state;
}

export function getOperationModeSnapshot() {
  const state = getState();
  const modeScore = state.mode === 'normal'
    ? 100
    : state.mode === 'degraded'
      ? 70
      : state.mode === 'maintenance'
        ? 60
        : state.mode === 'recovery'
          ? 40
          : 20;

  return {
    mode: state.mode,
    reason: state.reason,
    changedAt: state.changedAt,
    readOnly: state.readOnly,
    queueWrites: state.queueWrites,
    modeScore,
    recentChanges: state.history.slice(0, 20),
  };
}

export function getOperationModeHistory(limit = 100) {
  return getState().history.slice(0, limit);
}
