import { loadSystemAdminState } from '@/lib/system-admin-store';

export type ObservabilityLogLevel = 'info' | 'warn' | 'error';

export type ObservabilityLogEntry = {
  id: string;
  timestamp: string;
  level: ObservabilityLogLevel;
  message: string;
  tenantId?: string;
  service: string;
  route?: string;
  context?: Record<string, unknown>;
};

type TenantMetricState = {
  tenantId: string;
  requestCount: number;
  errorCount: number;
  totalResponseMs: number;
  lastResponseMs: number;
  websocketConnected: boolean;
  websocketLastChangeAt?: string;
  printerOnlineCount: number;
  printerTotalCount: number;
  printerFailedJobs: number;
  syncFailures: number;
  syncPending: number;
  lastSyncError?: string;
  failedSyncEvents: number;
  updatedAt: string;
};

type SlowQueryEntry = {
  id: string;
  timestamp: string;
  durationMs: number;
  query: string;
  target?: string;
};

type ServerMetricSnapshot = {
  uptimeSec: number;
  nodeVersion: string;
  pm2: {
    enabled: boolean;
    processId?: string;
    instance?: string;
    restartCount?: string;
  };
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  redis: {
    enabled: boolean;
    healthy: boolean;
    latencyMs?: number;
    message?: string;
  };
  postgres: {
    healthy: boolean;
    latencyMs?: number;
    message?: string;
    activeConnections?: number;
  };
  websocket: {
    configured: boolean;
    url?: string;
  };
  kitchenPrinter: {
    online: number;
    total: number;
    failedJobs: number;
  };
  failedSyncs: {
    totalFailedEvents: number;
  };
};

type ObservabilityState = {
  logs: ObservabilityLogEntry[];
  slowQueries: SlowQueryEntry[];
  tenantMetrics: Record<string, TenantMetricState>;
};

const MAX_LOGS = 1500;
const MAX_SLOW_QUERIES = 300;

const globalState = globalThis as typeof globalThis & {
  __adisyumObservability?: ObservabilityState;
};

function nowIso() {
  return new Date().toISOString();
}

function createDefaultState(): ObservabilityState {
  return {
    logs: [],
    slowQueries: [],
    tenantMetrics: {},
  };
}

function getState() {
  if (!globalState.__adisyumObservability) {
    globalState.__adisyumObservability = createDefaultState();
  }
  return globalState.__adisyumObservability;
}

function trimArray<T>(items: T[], max: number) {
  if (items.length <= max) return items;
  return items.slice(items.length - max);
}

function ensureTenantMetric(tenantId: string): TenantMetricState {
  const state = getState();
  const current = state.tenantMetrics[tenantId];
  if (current) return current;
  const seeded: TenantMetricState = {
    tenantId,
    requestCount: 0,
    errorCount: 0,
    totalResponseMs: 0,
    lastResponseMs: 0,
    websocketConnected: true,
    printerOnlineCount: 0,
    printerTotalCount: 0,
    printerFailedJobs: 0,
    syncFailures: 0,
    syncPending: 0,
    failedSyncEvents: 0,
    updatedAt: nowIso(),
  };
  state.tenantMetrics[tenantId] = seeded;
  return seeded;
}

export function recordStructuredLog(input: {
  level: ObservabilityLogLevel;
  message: string;
  tenantId?: string;
  service: string;
  route?: string;
  context?: Record<string, unknown>;
}) {
  const state = getState();
  const entry: ObservabilityLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: nowIso(),
    level: input.level,
    message: input.message,
    tenantId: input.tenantId,
    service: input.service,
    route: input.route,
    context: input.context,
  };

  state.logs.push(entry);
  state.logs = trimArray(state.logs, MAX_LOGS);
  return entry;
}

export function recordRequestMetric(input: {
  tenantId?: string;
  route: string;
  durationMs: number;
  statusCode: number;
  method?: string;
}) {
  if (!input.tenantId) return;
  const tenant = ensureTenantMetric(input.tenantId);
  tenant.requestCount += 1;
  tenant.totalResponseMs += input.durationMs;
  tenant.lastResponseMs = input.durationMs;
  if (input.statusCode >= 500) {
    tenant.errorCount += 1;
  }
  tenant.updatedAt = nowIso();
}

export function recordTenantError(input: {
  tenantId?: string;
  message: string;
  scope: string;
  route?: string;
}) {
  if (!input.tenantId) return;
  const tenant = ensureTenantMetric(input.tenantId);
  tenant.errorCount += 1;
  tenant.updatedAt = nowIso();
  recordStructuredLog({
    level: 'error',
    message: input.message,
    tenantId: input.tenantId,
    service: input.scope,
    route: input.route,
  });
}

export function recordSlowQuery(input: { durationMs: number; query: string; target?: string }) {
  const state = getState();
  const entry: SlowQueryEntry = {
    id: `sql-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: nowIso(),
    durationMs: input.durationMs,
    query: input.query.slice(0, 500),
    target: input.target,
  };
  state.slowQueries.push(entry);
  state.slowQueries = trimArray(state.slowQueries, MAX_SLOW_QUERIES);
}

export function recordTenantRealtimeHealth(input: {
  tenantId?: string;
  connected: boolean;
  source: 'websocket' | 'printer' | 'sync';
  printerOnlineCount?: number;
  printerTotalCount?: number;
  printerFailedJobs?: number;
  syncFailures?: number;
  syncPending?: number;
  lastSyncError?: string;
}) {
  if (!input.tenantId) return;
  const tenant = ensureTenantMetric(input.tenantId);

  if (input.source === 'websocket') {
    tenant.websocketConnected = input.connected;
    tenant.websocketLastChangeAt = nowIso();
  }

  if (input.source === 'printer') {
    tenant.printerOnlineCount = Math.max(input.printerOnlineCount ?? tenant.printerOnlineCount, 0);
    tenant.printerTotalCount = Math.max(input.printerTotalCount ?? tenant.printerTotalCount, 0);
    tenant.printerFailedJobs = Math.max(input.printerFailedJobs ?? tenant.printerFailedJobs, 0);
  }

  if (input.source === 'sync') {
    tenant.syncFailures = Math.max(input.syncFailures ?? tenant.syncFailures, 0);
    tenant.syncPending = Math.max(input.syncPending ?? tenant.syncPending, 0);
    if (input.syncFailures && input.syncFailures > 0) {
      tenant.failedSyncEvents += 1;
    }
    tenant.lastSyncError = input.lastSyncError;
  }

  tenant.updatedAt = nowIso();
}

export function buildTenantObservabilityRows() {
  const state = getState();
  const adminState = loadSystemAdminState();

  return Object.values(state.tenantMetrics).map((metric) => {
    const company = adminState.tenants.find((tenant) => tenant.tenant_id === metric.tenantId)?.company_name ?? metric.tenantId;
    const errorRate = metric.requestCount > 0 ? (metric.errorCount / metric.requestCount) * 100 : 0;
    const avgResponseMs = metric.requestCount > 0 ? metric.totalResponseMs / metric.requestCount : 0;
    const websocketHealth = metric.websocketConnected ? 'healthy' : 'degraded';
    const printerHealth = metric.printerTotalCount === 0
      ? 'unknown'
      : metric.printerOnlineCount === metric.printerTotalCount
        ? 'healthy'
        : 'degraded';

    return {
      tenantId: metric.tenantId,
      companyName: company,
      errorRate,
      avgResponseMs,
      websocketHealth,
      printerHealth,
      printerOnlineCount: metric.printerOnlineCount,
      printerTotalCount: metric.printerTotalCount,
      syncFailures: metric.syncFailures,
      syncPending: metric.syncPending,
      lastSyncError: metric.lastSyncError,
      updatedAt: metric.updatedAt,
    };
  });
}

export function buildServerMetricSnapshot(input: {
  postgres: { healthy: boolean; latencyMs?: number; message?: string; activeConnections?: number };
  redis: { enabled: boolean; healthy: boolean; latencyMs?: number; message?: string };
}): ServerMetricSnapshot {
  const tenantRows = buildTenantObservabilityRows();
  const kitchenPrinter = tenantRows.reduce(
    (sum, row) => ({
      online: sum.online + row.printerOnlineCount,
      total: sum.total + row.printerTotalCount,
      failedJobs: sum.failedJobs + (row.syncFailures > 0 ? row.syncFailures : 0),
    }),
    { online: 0, total: 0, failedJobs: 0 },
  );

  const failedSyncs = tenantRows.reduce((sum, row) => sum + row.syncFailures, 0);

  return {
    uptimeSec: process.uptime(),
    nodeVersion: process.version,
    pm2: {
      enabled: Boolean(process.env.pm_id),
      processId: process.env.pm_id,
      instance: process.env.NODE_APP_INSTANCE,
      restartCount: process.env.PM2_RESTART_COUNT,
    },
    memory: {
      rssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMb: Number((process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1)),
    },
    redis: input.redis,
    postgres: input.postgres,
    websocket: {
      configured: Boolean(process.env.WEBSOCKET_URL || process.env.NEXT_PUBLIC_WEBSOCKET_URL),
      url: process.env.WEBSOCKET_URL || process.env.NEXT_PUBLIC_WEBSOCKET_URL,
    },
    kitchenPrinter,
    failedSyncs: {
      totalFailedEvents: failedSyncs,
    },
  };
}

export function getRecentObservabilityLogs(limit = 300) {
  const state = getState();
  return state.logs.slice(Math.max(state.logs.length - limit, 0)).reverse();
}

export function getRecentSlowQueries(limit = 100) {
  const state = getState();
  return state.slowQueries.slice(Math.max(state.slowQueries.length - limit, 0)).reverse();
}
