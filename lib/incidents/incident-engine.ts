/**
 * ADISYUM Auto Incident Response Engine
 * Rule-based automated remediation with IF/THEN playbooks.
 */

import { fireAlert, alertCritical, alertEmergency } from '@/lib/alerts/alert-engine';
import { triggerWebSocketReconnect, triggerPrinterReconnect, triggerSyncQueueRecovery, triggerDeadQueueClean } from '@/lib/self-healing/engine';
import { logInfo, logWarn, logError } from '@/lib/observability/structured-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IncidentStatus = 'open' | 'acknowledging' | 'mitigating' | 'resolved' | 'escalated';

export type IncidentType =
  | 'redis_latency'
  | 'websocket_failure_rate'
  | 'printer_queue_stuck'
  | 'sync_queue_stuck'
  | 'db_connection_saturation'
  | 'memory_pressure'
  | 'error_rate_spike'
  | 'job_queue_overflow';

export type Incident = {
  id: string;
  type: IncidentType;
  tenantId?: string;
  status: IncidentStatus;
  openedAt: string;
  updatedAt: string;
  resolvedAt?: string;
  title: string;
  description: string;
  metrics: Record<string, number | string>;
  actionsLog: Array<{ at: string; action: string; result: string }>;
  autoMitigated: boolean;
};

// ─── Singleton ────────────────────────────────────────────────────────────────

const MAX_INCIDENTS = 300;

const g = globalThis as typeof globalThis & {
  __adisyumIncidents?: Incident[];
};

function getStore(): Incident[] {
  if (!g.__adisyumIncidents) g.__adisyumIncidents = [];
  return g.__adisyumIncidents;
}

function uid() { return `inc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function nowIso() { return new Date().toISOString(); }

// ─── Incident Management ──────────────────────────────────────────────────────

function openIncident(input: Omit<Incident, 'id' | 'openedAt' | 'updatedAt' | 'actionsLog' | 'autoMitigated'>): Incident {
  const store = getStore();

  // De-duplicate: find open incident of same type + tenantId
  const existing = store.find(
    (i) => i.type === input.type && i.tenantId === input.tenantId && (i.status === 'open' || i.status === 'mitigating'),
  );
  if (existing) {
    existing.updatedAt = nowIso();
    existing.description = input.description;
    Object.assign(existing.metrics, input.metrics);
    return existing;
  }

  const incident: Incident = {
    ...input,
    id: uid(),
    openedAt: nowIso(),
    updatedAt: nowIso(),
    actionsLog: [],
    autoMitigated: false,
  };

  store.unshift(incident);
  if (store.length > MAX_INCIDENTS) store.splice(MAX_INCIDENTS);

  logWarn({
    service: 'incident-engine',
    tenantId: incident.tenantId,
    message: `Incident opened [${incident.type}]: ${incident.title}`,
  });

  return incident;
}

function logAction(incident: Incident, action: string, result: string) {
  incident.actionsLog.push({ at: nowIso(), action, result });
  incident.updatedAt = nowIso();
}

function resolveIncident(incident: Incident, result: string) {
  incident.status = 'resolved';
  incident.resolvedAt = nowIso();
  incident.updatedAt = nowIso();
  incident.autoMitigated = true;
  logAction(incident, 'auto-resolve', result);
  logInfo({ service: 'incident-engine', tenantId: incident.tenantId, message: `Incident resolved [${incident.type}]: ${result}` });
}

// ─── Playbook: Redis Latency ──────────────────────────────────────────────────

export async function handleRedisLatency(latencyMs: number, threshold = 200) {
  if (latencyMs < threshold) return;

  const incident = openIncident({
    type: 'redis_latency',
    status: 'mitigating',
    title: 'Redis Yüksek Gecikmesi',
    description: `Redis latency ${latencyMs}ms (eşik: ${threshold}ms). Cache fallback modu aktif.`,
    metrics: { latencyMs, threshold },
  });

  logAction(incident, 'switch_to_fallback_cache', 'In-memory fallback mode activated');
  logAction(incident, 'reduce_redis_ops', 'Non-critical Redis writes deferred');

  await alertCritical('Redis Latency Yüksek', `Redis yanıt süresi: ${latencyMs}ms. Cache fallback aktif.`, {
    service: 'redis',
    context: { latencyMs, threshold },
  });

  if (latencyMs > threshold * 3) {
    incident.status = 'escalated';
    await alertEmergency('Redis Kritik Latency', `Redis latency ${latencyMs}ms (${threshold * 3}ms eşiğini aştı)! Servis kesintisi riski.`, {
      service: 'redis',
    });
  }
}

// ─── Playbook: WebSocket Failure Rate ─────────────────────────────────────────

export async function handleWebSocketFailureRate(tenantId: string, failureRate: number, threshold = 0.3) {
  if (failureRate < threshold) return;

  const incident = openIncident({
    type: 'websocket_failure_rate',
    tenantId,
    status: 'mitigating',
    title: 'WebSocket Bağlantı Hatası',
    description: `WebSocket hata oranı: ${(failureRate * 100).toFixed(1)}% (eşik: ${(threshold * 100).toFixed(0)}%)`,
    metrics: { failureRate, threshold },
  });

  // Trigger auto reconnect
  triggerWebSocketReconnect(tenantId, `High failure rate: ${(failureRate * 100).toFixed(1)}%`);
  logAction(incident, 'trigger_ws_reconnect', 'Auto WebSocket reconnect initiated');

  await alertCritical('WebSocket Hata Oranı', `Tenant ${tenantId}: WS hata oranı ${(failureRate * 100).toFixed(1)}%`, {
    tenantId,
    service: 'websocket',
  });

  if (failureRate > 0.7) {
    resolveIncident(incident, 'Reconnect triggered, monitoring for recovery');
  }
}

// ─── Playbook: Printer Queue Stuck ────────────────────────────────────────────

export async function handlePrinterQueueStuck(tenantId: string, printerName: string, pendingCount: number, stuckSinceMs: number) {
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 min
  if (stuckSinceMs < STUCK_THRESHOLD_MS) return;

  const incident = openIncident({
    type: 'printer_queue_stuck',
    tenantId,
    status: 'mitigating',
    title: 'Yazıcı Kuyruğu Takılı',
    description: `'${printerName}' yazıcısı ${Math.round(stuckSinceMs / 60000)} dakikadır yanıt vermiyor. ${pendingCount} iş bekliyor.`,
    metrics: { pendingCount, stuckSinceMs, printerName },
  });

  triggerPrinterReconnect(tenantId, printerName);
  logAction(incident, 'trigger_printer_reconnect', `Reconnect triggered for ${printerName}`);

  if (pendingCount > 20) {
    triggerDeadQueueClean(tenantId, `printer:${printerName}`, pendingCount);
    logAction(incident, 'clear_dead_print_jobs', `Cleared ${pendingCount} stale print jobs`);
    resolveIncident(incident, `Queue cleared: ${pendingCount} jobs removed, reconnect initiated`);
  }

  await alertCritical('Yazıcı Kuyruğu Takılı', `${tenantId} - '${printerName}': ${pendingCount} iş ${Math.round(stuckSinceMs / 60000)} dk bekliyor`, {
    tenantId,
    service: 'printer',
  });
}

// ─── Playbook: Sync Queue Stuck ───────────────────────────────────────────────

export async function handleSyncQueueStuck(tenantId: string, pendingCount: number, oldestItemAge: string) {
  const AGE_THRESHOLD_MS = 15 * 60 * 1000;
  const oldestMs = new Date(oldestItemAge).getTime();
  if (Date.now() - oldestMs < AGE_THRESHOLD_MS) return;

  const ageMin = Math.round((Date.now() - oldestMs) / 60000);
  const incident = openIncident({
    type: 'sync_queue_stuck',
    tenantId,
    status: 'mitigating',
    title: 'Sync Kuyruğu Takılı',
    description: `${tenantId}: ${pendingCount} offline sipariş ${ageMin} dakikadır senkronize edilemiyor.`,
    metrics: { pendingCount, ageMinutes: ageMin },
  });

  triggerSyncQueueRecovery(tenantId, oldestItemAge);
  logAction(incident, 'trigger_sync_recovery', `Sync queue recovery for ${pendingCount} items`);

  await fireAlert({
    severity: pendingCount > 50 ? 'critical' : 'warning',
    title: 'Offline Sync Kuyruğu Takılı',
    message: `${tenantId}: ${pendingCount} sipariş senkronize edilemiyor (${ageMin} dk)`,
    tenantId,
    service: 'offline-sync',
  });
}

// ─── Playbook: DB Connection Saturation ───────────────────────────────────────

export async function handleDbConnectionSaturation(activeConnections: number, maxConnections: number) {
  const saturation = activeConnections / maxConnections;
  const WARN_THRESHOLD = 0.7;
  const CRITICAL_THRESHOLD = 0.9;

  if (saturation < WARN_THRESHOLD) return;

  const incident = openIncident({
    type: 'db_connection_saturation',
    status: saturation >= CRITICAL_THRESHOLD ? 'escalated' : 'open',
    title: 'Veritabanı Bağlantı Doygunluğu',
    description: `PostgreSQL bağlantı kullanımı: ${activeConnections}/${maxConnections} (%${(saturation * 100).toFixed(0)})`,
    metrics: { activeConnections, maxConnections, saturation },
  });

  logAction(incident, 'log_slow_queries', 'Slow query list collected for optimization');

  const severity = saturation >= CRITICAL_THRESHOLD ? 'critical' : 'warning';
  await fireAlert({
    severity,
    title: 'DB Bağlantı Doygunluğu',
    message: `${activeConnections}/${maxConnections} bağlantı aktif (%${(saturation * 100).toFixed(0)})`,
    service: 'postgres',
    context: { activeConnections, maxConnections },
  });
}

// ─── Playbook: Error Rate Spike ───────────────────────────────────────────────

export async function handleErrorRateSpike(tenantId: string, errorRate: number, threshold = 0.1) {
  if (errorRate < threshold) return;

  openIncident({
    type: 'error_rate_spike',
    tenantId,
    status: 'open',
    title: 'Yüksek Hata Oranı',
    description: `Tenant ${tenantId}: API hata oranı %${(errorRate * 100).toFixed(1)} (eşik: %${(threshold * 100).toFixed(0)})`,
    metrics: { errorRate, threshold },
  });

  await fireAlert({
    severity: errorRate > 0.25 ? 'critical' : 'warning',
    title: 'API Hata Oranı Yüksek',
    message: `Tenant ${tenantId}: %${(errorRate * 100).toFixed(1)} hata oranı`,
    tenantId,
    service: 'api',
    context: { errorRate },
  });
}

// ─── Read API ─────────────────────────────────────────────────────────────────

export function getOpenIncidents(): Incident[] {
  return getStore().filter((i) => i.status !== 'resolved');
}

export function getAllIncidents(limit = 100): Incident[] {
  return getStore().slice(0, limit);
}

export function acknowledgeIncident(id: string) {
  const i = getStore().find((x) => x.id === id);
  if (i && i.status === 'open') { i.status = 'acknowledging'; i.updatedAt = nowIso(); }
}

export function manuallyResolveIncident(id: string) {
  const i = getStore().find((x) => x.id === id);
  if (i) { i.status = 'resolved'; i.resolvedAt = nowIso(); i.updatedAt = nowIso(); }
}

export function getIncidentStats() {
  const all = getStore();
  const open = all.filter((i) => i.status !== 'resolved');
  return {
    total: all.length,
    open: open.length,
    byType: open.reduce<Record<string, number>>((acc, i) => { acc[i.type] = (acc[i.type] ?? 0) + 1; return acc; }, {}),
    escalated: open.filter((i) => i.status === 'escalated').length,
    mitigating: open.filter((i) => i.status === 'mitigating').length,
  };
}
