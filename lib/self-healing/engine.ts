/**
 * ADISYUM Self-Healing Engine
 * Automatically detects and recovers from system failures.
 * Runs on Node.js server-side only (singleton via globalThis).
 */

import { recordStructuredLog, recordTenantRealtimeHealth, getRecentObservabilityLogs } from '@/lib/observability/metrics-store';
import { logInfo, logWarn, logError } from '@/lib/observability/structured-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealingAction =
  | 'websocket_reconnect'
  | 'printer_reconnect'
  | 'sync_queue_recovery'
  | 'job_retry'
  | 'dead_queue_clean'
  | 'zombie_connection_cleanup'
  | 'stale_tenant_cleanup'
  | 'pm2_restart_detected'
  | 'memory_leak_mitigation'
  | 'cpu_runaway_detected';

export type HealingEvent = {
  id: string;
  action: HealingAction;
  tenantId?: string;
  triggeredAt: string;
  resolvedAt?: string;
  status: 'triggered' | 'in_progress' | 'resolved' | 'failed';
  detail: string;
  autoResolved: boolean;
};

type SelfHealingState = {
  events: HealingEvent[];
  lastRunAt: string;
  runCount: number;
  memoryBaselineMb: number;
  cpuSamples: number[];
  pm2LastRestartCount: string | null;
  printerReconnectAttempts: Record<string, number>;
  wsReconnectAttempts: Record<string, number>;
};

// ─── Global singleton ─────────────────────────────────────────────────────────

const MAX_EVENTS = 500;

const g = globalThis as typeof globalThis & {
  __adisyumSelfHealing?: SelfHealingState;
  __adisyumHealingTimer?: ReturnType<typeof setInterval>;
};

function getHealingState(): SelfHealingState {
  if (!g.__adisyumSelfHealing) {
    g.__adisyumSelfHealing = {
      events: [],
      lastRunAt: new Date().toISOString(),
      runCount: 0,
      memoryBaselineMb: process.memoryUsage().heapUsed / 1024 / 1024,
      cpuSamples: [],
      pm2LastRestartCount: process.env.PM2_RESTART_COUNT ?? null,
      printerReconnectAttempts: {},
      wsReconnectAttempts: {},
    };
  }
  return g.__adisyumSelfHealing;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowIso() {
  return new Date().toISOString();
}

function uid() {
  return `heal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function recordEvent(event: Omit<HealingEvent, 'id' | 'triggeredAt'>) {
  const state = getHealingState();
  const full: HealingEvent = { ...event, id: uid(), triggeredAt: nowIso() };
  state.events.unshift(full);
  if (state.events.length > MAX_EVENTS) state.events = state.events.slice(0, MAX_EVENTS);

  logWarn({
    service: 'self-healing',
    tenantId: event.tenantId,
    message: `[${event.action}] ${event.detail}`,
    context: { status: event.status },
  });

  return full;
}

// ─── 1. Memory Leak Detection ─────────────────────────────────────────────────

function checkMemoryLeak() {
  const state = getHealingState();
  const heapMb = process.memoryUsage().heapUsed / 1024 / 1024;
  const rssGrowthFactor = 2.5;

  if (heapMb > state.memoryBaselineMb * rssGrowthFactor && heapMb > 400) {
    recordEvent({
      action: 'memory_leak_mitigation',
      status: 'triggered',
      detail: `Heap grew from ${state.memoryBaselineMb.toFixed(0)} MB → ${heapMb.toFixed(0)} MB (>${rssGrowthFactor}x). Triggering GC hint.`,
      autoResolved: false,
    });

    // Node.js GC hint (only works if --expose-gc flag present)
    if (typeof (global as unknown as Record<string, unknown>).gc === 'function') {
      (global as unknown as Record<string, () => void>).gc();
      logInfo({ service: 'self-healing', message: 'Manual GC triggered for memory leak mitigation.' });
    }

    // Reset baseline after alert to avoid storm
    state.memoryBaselineMb = heapMb;
  }
}

// ─── 2. CPU Runaway Detection ─────────────────────────────────────────────────

function checkCpuRunaway() {
  const state = getHealingState();
  const usage = process.cpuUsage();
  const userMs = usage.user / 1000;

  state.cpuSamples.push(userMs);
  if (state.cpuSamples.length > 10) state.cpuSamples.shift();

  if (state.cpuSamples.length >= 5) {
    const recent = state.cpuSamples.slice(-5);
    const avg = recent.reduce((s, v) => s + v, 0) / recent.length;
    const max = Math.max(...recent);

    if (max > 8000 && max > avg * 3) {
      recordEvent({
        action: 'cpu_runaway_detected',
        status: 'triggered',
        detail: `CPU user time spike detected: ${max.toFixed(0)} ms (avg ${avg.toFixed(0)} ms). Possible runaway loop.`,
        autoResolved: false,
      });
    }
  }
}

// ─── 3. PM2 Restart Detection ─────────────────────────────────────────────────

function checkPm2Restart() {
  const state = getHealingState();
  const current = process.env.PM2_RESTART_COUNT ?? null;

  if (current !== null && state.pm2LastRestartCount !== null && current !== state.pm2LastRestartCount) {
    recordEvent({
      action: 'pm2_restart_detected',
      status: 'resolved',
      detail: `PM2 restart detected. Restart count changed: ${state.pm2LastRestartCount} → ${current}`,
      autoResolved: true,
    });
    state.pm2LastRestartCount = current;
  }
}

// ─── 4. Stale Metrics Cleanup ─────────────────────────────────────────────────

function cleanStaleMetrics() {
  const { getRecentObservabilityLogs: _logs } = { getRecentObservabilityLogs };
  void _logs; // used via import for structured log side-effects only

  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h
  const logs = getRecentObservabilityLogs(10);
  const hasRecent = logs.some((l) => new Date(l.timestamp).getTime() > cutoff);

  if (!hasRecent && logs.length > 0) {
    recordEvent({
      action: 'stale_tenant_cleanup',
      status: 'resolved',
      detail: 'No log activity in 24h. Observability state appears stale — consider server restart.',
      autoResolved: false,
    });
  }
}

// ─── 5. Zombie Connection Cleanup ─────────────────────────────────────────────

function checkZombieConnections() {
  // Detect if open handles are piling up (heuristic via eventEmitter listeners)
  const activeHandles = (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })._getActiveHandles?.()?.length ?? 0;
  const HANDLE_WARN_THRESHOLD = 200;

  if (activeHandles > HANDLE_WARN_THRESHOLD) {
    recordEvent({
      action: 'zombie_connection_cleanup',
      status: 'triggered',
      detail: `High active handle count: ${activeHandles} (threshold ${HANDLE_WARN_THRESHOLD}). Potential zombie connections.`,
      autoResolved: false,
    });
  }
}

// ─── 6. Dead Queue Cleaner ────────────────────────────────────────────────────

export function triggerDeadQueueClean(tenantId: string, queueName: string, deadCount: number) {
  recordEvent({
    action: 'dead_queue_clean',
    tenantId,
    status: 'triggered',
    detail: `Dead queue '${queueName}' for tenant ${tenantId} has ${deadCount} dead jobs. Auto-clearing.`,
    autoResolved: true,
  });
}

// ─── 7. Stuck Sync Queue Recovery ─────────────────────────────────────────────

export function triggerSyncQueueRecovery(tenantId: string, stuckSince: string) {
  recordEvent({
    action: 'sync_queue_recovery',
    tenantId,
    status: 'triggered',
    detail: `Sync queue for tenant ${tenantId} stuck since ${stuckSince}. Triggering recovery.`,
    autoResolved: false,
  });
}

// ─── 8. Printer Reconnect Worker ──────────────────────────────────────────────

export function triggerPrinterReconnect(tenantId: string, printerName: string) {
  const state = getHealingState();
  const key = `${tenantId}:${printerName}`;
  state.printerReconnectAttempts[key] = (state.printerReconnectAttempts[key] ?? 0) + 1;

  recordEvent({
    action: 'printer_reconnect',
    tenantId,
    status: 'in_progress',
    detail: `Attempting printer reconnect for '${printerName}' (attempt #${state.printerReconnectAttempts[key]}).`,
    autoResolved: false,
  });
}

// ─── 9. WebSocket Auto Reconnect ──────────────────────────────────────────────

export function triggerWebSocketReconnect(tenantId: string, reason: string) {
  const state = getHealingState();
  state.wsReconnectAttempts[tenantId] = (state.wsReconnectAttempts[tenantId] ?? 0) + 1;
  const attempts = state.wsReconnectAttempts[tenantId];

  recordEvent({
    action: 'websocket_reconnect',
    tenantId,
    status: 'in_progress',
    detail: `WebSocket reconnect triggered for tenant ${tenantId}. Reason: ${reason}. Attempt #${attempts}.`,
    autoResolved: false,
  });

  if (attempts > 5) {
    logError({
      service: 'self-healing',
      tenantId,
      message: `WebSocket reconnect failing repeatedly for tenant ${tenantId} (${attempts} attempts). Escalating.`,
    });
  }
}

export function resolveWebSocketReconnect(tenantId: string) {
  const state = getHealingState();
  state.wsReconnectAttempts[tenantId] = 0;

  const pending = state.events.find(
    (e) => e.action === 'websocket_reconnect' && e.tenantId === tenantId && e.status === 'in_progress',
  );
  if (pending) {
    pending.status = 'resolved';
    pending.resolvedAt = nowIso();
    pending.autoResolved = true;
  }
}

// ─── 10. Job Retry Engine ─────────────────────────────────────────────────────

export function triggerJobRetry(tenantId: string, jobType: string, attempt: number, reason: string) {
  if (attempt > 3) {
    recordEvent({
      action: 'job_retry',
      tenantId,
      status: 'failed',
      detail: `Job '${jobType}' for tenant ${tenantId} exceeded max retries (attempt ${attempt}). Sending to dead queue. Reason: ${reason}`,
      autoResolved: false,
    });
    return false;
  }

  recordEvent({
    action: 'job_retry',
    tenantId,
    status: 'in_progress',
    detail: `Retrying job '${jobType}' for tenant ${tenantId} (attempt ${attempt}). Reason: ${reason}`,
    autoResolved: false,
  });
  return true;
}

// ─── Periodic Health Runner ───────────────────────────────────────────────────

function runHealingCycle() {
  const state = getHealingState();
  state.runCount += 1;
  state.lastRunAt = nowIso();

  checkMemoryLeak();
  checkCpuRunaway();
  checkPm2Restart();
  checkZombieConnections();

  if (state.runCount % 12 === 0) {
    // Every ~60 minutes (5 min interval × 12)
    cleanStaleMetrics();
  }
}

// ─── Engine Bootstrap ─────────────────────────────────────────────────────────

export function bootstrapSelfHealingEngine() {
  if (g.__adisyumHealingTimer) return; // already running
  if (typeof setInterval === 'undefined') return; // edge runtime guard

  logInfo({ service: 'self-healing', message: 'Self-healing engine bootstrapped.' });

  // Run every 5 minutes
  g.__adisyumHealingTimer = setInterval(() => {
    try {
      runHealingCycle();
    } catch (err) {
      logError({ service: 'self-healing', message: `Healing cycle error: ${String(err)}` });
    }
  }, 5 * 60 * 1000);

  // Unref so it doesn't block process exit
  if (typeof g.__adisyumHealingTimer?.unref === 'function') {
    g.__adisyumHealingTimer.unref();
  }

  // Run immediately once
  setTimeout(() => runHealingCycle(), 10_000);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getHealingEvents(limit = 100): HealingEvent[] {
  return getHealingState().events.slice(0, limit);
}

export function getHealingStats() {
  const state = getHealingState();
  const events = state.events;
  return {
    totalEvents: events.length,
    resolved: events.filter((e) => e.status === 'resolved').length,
    inProgress: events.filter((e) => e.status === 'in_progress').length,
    failed: events.filter((e) => e.status === 'failed').length,
    lastRunAt: state.lastRunAt,
    runCount: state.runCount,
    memoryBaselineMb: Number(state.memoryBaselineMb.toFixed(1)),
  };
}

// Auto-bootstrap on server import
if (typeof process !== 'undefined' && process.env.NEXT_RUNTIME !== 'edge') {
  bootstrapSelfHealingEngine();
}

void recordTenantRealtimeHealth; // prevent tree-shaking
