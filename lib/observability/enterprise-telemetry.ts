import {
  buildReleaseTelemetryRows,
  buildServerMetricSnapshot,
  buildTenantObservabilityRows,
  getRecentObservabilityLogs,
  getRecentSlowQueries,
  getReleaseTelemetrySummary,
  recordStructuredLog,
  type ObservabilityLogLevel,
} from '@/lib/observability/metrics-store';
import { getHealingEvents, getHealingStats } from '@/lib/self-healing/engine';

export type EnterpriseTelemetryScope =
  | 'runtime'
  | 'api'
  | 'database'
  | 'deployment'
  | 'client-runtime'
  | 'websocket'
  | 'persistence'
  | 'reconciliation'
  | 'tenant-integrity'
  | 'recovery';

export type EnterpriseTelemetrySeverity = 'info' | 'warn' | 'error' | 'critical';

export type EnterpriseTelemetryEvent = {
  id: string;
  timestamp: string;
  scope: EnterpriseTelemetryScope;
  severity: EnterpriseTelemetrySeverity;
  message: string;
  tenantId?: string;
  route?: string;
  context?: Record<string, unknown>;
};

export type RuntimeTelemetrySnapshot = {
  uptimeSeconds: number;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
  };
  pm2: {
    enabled: boolean;
    processId: string | null;
    instanceId: string | null;
    restartCount: string | null;
  };
  pressureSignals: {
    memoryPressure: boolean;
    healingInProgress: number;
    unresolvedHealingEvents: number;
    recentErrorLogs: number;
    recentSlowQueries: number;
  };
};

export type DeploymentTelemetrySnapshot = {
  runtimeBuildIdEndpoint: '/api/runtime-build-id';
  activeGitCommit: string | null;
  deploymentTime: string | null;
  nodeEnv: string | null;
  port: string | null;
  runtimeAuthority: {
    canonicalApp: 'adisyum-root-app';
    canonicalAppPort: '3000';
    canonicalWebsite: 'adisyum-website';
    canonicalWebsitePort: '3010';
  };
  pm2Ownership: {
    expectedApps: string[];
    activeProcessId: string | null;
    restartCount: string | null;
  };
  nginxOwnership: {
    apiUpstream: '127.0.0.1:3000';
    appUpstream: '127.0.0.1:3000';
    systemAdminUpstream: '127.0.0.1:3000';
    websiteUpstream: '127.0.0.1:3010';
    legacyRedirect: 'legacy POS route -> /app';
  };
  driftChecks: string[];
};

export type ClientRuntimeTelemetrySnapshot = {
  diagnosticsOwners: {
    eventBus: 'getRuntimeEventBusDiagnostics';
    persistence: 'getRuntimePersistenceDiagnostics';
    sync: 'getRuntimeSyncDiagnostics';
    mutations: 'getOrderMutationRuntimeDiagnostics';
  };
  boundedSignals: string[];
  recoverySignals: string[];
};

export type RecoveryContract = {
  name: string;
  owner: 'self-healing-engine' | 'deployment-validator' | 'runtime-persistence-engine' | 'runtime-sync-engine' | 'order-mutations-runtime';
  detects: string[];
  recovers: string[];
  escalation: string;
};

export type EnterpriseTelemetrySnapshot = {
  generatedAt: string;
  runtime: RuntimeTelemetrySnapshot;
  deployment: DeploymentTelemetrySnapshot;
  clientRuntime: ClientRuntimeTelemetrySnapshot;
  recoveryContracts: RecoveryContract[];
  releaseSummary: ReturnType<typeof getReleaseTelemetrySummary>;
  tenantHealthRows: ReturnType<typeof buildTenantObservabilityRows>;
  server: ReturnType<typeof buildServerMetricSnapshot>;
  recentEnterpriseEvents: EnterpriseTelemetryEvent[];
};

const MAX_ENTERPRISE_EVENTS = 1000;

const g = globalThis as typeof globalThis & {
  __adisyumEnterpriseTelemetry?: EnterpriseTelemetryEvent[];
};

function nowIso() {
  return new Date().toISOString();
}

function getEnterpriseTelemetryState() {
  if (!g.__adisyumEnterpriseTelemetry) g.__adisyumEnterpriseTelemetry = [];
  return g.__adisyumEnterpriseTelemetry;
}

function toLogLevel(severity: EnterpriseTelemetrySeverity): ObservabilityLogLevel {
  if (severity === 'critical') return 'error';
  return severity;
}

function mb(value: number) {
  return Number((value / 1024 / 1024).toFixed(1));
}

export function recordEnterpriseTelemetry(input: {
  scope: EnterpriseTelemetryScope;
  severity?: EnterpriseTelemetrySeverity;
  message: string;
  tenantId?: string;
  route?: string;
  context?: Record<string, unknown>;
}) {
  const severity = input.severity ?? 'info';
  const event: EnterpriseTelemetryEvent = {
    id: `enterprise-telemetry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: nowIso(),
    scope: input.scope,
    severity,
    message: input.message,
    tenantId: input.tenantId,
    route: input.route,
    context: input.context,
  };

  const state = getEnterpriseTelemetryState();
  state.unshift(event);
  if (state.length > MAX_ENTERPRISE_EVENTS) state.length = MAX_ENTERPRISE_EVENTS;

  recordStructuredLog({
    level: toLogLevel(severity),
    service: 'enterprise-telemetry',
    tenantId: input.tenantId,
    route: input.route,
    message: `[${input.scope}] ${input.message}`,
    context: input.context,
  });

  return event;
}

export function getRecentEnterpriseTelemetryEvents(limit = 100) {
  return getEnterpriseTelemetryState().slice(0, limit);
}

export function buildRuntimeTelemetrySnapshot(): RuntimeTelemetrySnapshot {
  const memory = process.memoryUsage();
  const healingStats = getHealingStats();
  const recentLogs = getRecentObservabilityLogs(250);
  const recentSlowQueries = getRecentSlowQueries(100);

  return {
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      heapUsedMb: mb(memory.heapUsed),
      heapTotalMb: mb(memory.heapTotal),
      rssMb: mb(memory.rss),
    },
    pm2: {
      enabled: Boolean(process.env.pm_id),
      processId: process.env.pm_id ?? null,
      instanceId: process.env.NODE_APP_INSTANCE ?? null,
      restartCount: process.env.PM2_RESTART_COUNT ?? null,
    },
    pressureSignals: {
      memoryPressure: mb(memory.heapUsed) > 512,
      healingInProgress: healingStats.inProgress,
      unresolvedHealingEvents: healingStats.inProgress + healingStats.failed,
      recentErrorLogs: recentLogs.filter((log) => log.level === 'error').length,
      recentSlowQueries: recentSlowQueries.length,
    },
  };
}

export function buildDeploymentTelemetrySnapshot(): DeploymentTelemetrySnapshot {
  return {
    runtimeBuildIdEndpoint: '/api/runtime-build-id',
    activeGitCommit: process.env.GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    deploymentTime: process.env.DEPLOYED_AT ?? null,
    nodeEnv: process.env.NODE_ENV ?? null,
    port: process.env.PORT ?? null,
    runtimeAuthority: {
      canonicalApp: 'adisyum-root-app',
      canonicalAppPort: '3000',
      canonicalWebsite: 'adisyum-website',
      canonicalWebsitePort: '3010',
    },
    pm2Ownership: {
      expectedApps: ['adisyum-root-app', 'adisyum-website', 'adisyum-worker'],
      activeProcessId: process.env.pm_id ?? null,
      restartCount: process.env.PM2_RESTART_COUNT ?? null,
    },
    nginxOwnership: {
      apiUpstream: '127.0.0.1:3000',
      appUpstream: '127.0.0.1:3000',
      systemAdminUpstream: '127.0.0.1:3000',
      websiteUpstream: '127.0.0.1:3010',
      legacyRedirect: 'legacy POS route -> /app',
    },
    driftChecks: [
      'runtime-build-id must match latest deployed commit',
      'PM2 must expose exactly the canonical process set',
      'nginx must route /api, /app, and /system-admin to 127.0.0.1:3000',
      'browser API calls must use the canonical /api namespace',
    ],
  };
}

export function buildClientRuntimeTelemetrySnapshot(): ClientRuntimeTelemetrySnapshot {
  return {
    diagnosticsOwners: {
      eventBus: 'getRuntimeEventBusDiagnostics',
      persistence: 'getRuntimePersistenceDiagnostics',
      sync: 'getRuntimeSyncDiagnostics',
      mutations: 'getOrderMutationRuntimeDiagnostics',
    },
    boundedSignals: [
      'render storm count',
      'hydration storm count',
      'websocket reconnect storm count',
      'persistence write flood count',
      'event bus duplicate suppression count',
      'optimistic mutation queue count',
    ],
    recoverySignals: [
      'stale snapshot invalidated',
      'corrupted persistence cleared',
      'runtime desync recovered',
      'optimistic queue drained',
      'hydration reentry suppressed',
    ],
  };
}

export function getEnterpriseRecoveryContracts(): RecoveryContract[] {
  return [
    {
      name: 'runtime-crash-restart-validation',
      owner: 'self-healing-engine',
      detects: ['PM2 restart count changes', 'memory pressure', 'CPU runaway', 'zombie handles'],
      recovers: ['records recovery telemetry', 'surfaces unresolved recovery work', 'keeps failure visible'],
      escalation: 'alert when restart loops or unresolved healing events grow',
    },
    {
      name: 'deployment-drift-detection',
      owner: 'deployment-validator',
      detects: ['runtime-build-id mismatch', 'stale standalone output', 'invalid PM2 ownership', 'nginx upstream drift'],
      recovers: ['fails deployment validation', 'requires fresh PM2 ownership', 'requires canonical nginx ownership'],
      escalation: 'deployment is invalid until live runtime proof matches the expected commit',
    },
    {
      name: 'client-persistence-recovery',
      owner: 'runtime-persistence-engine',
      detects: ['stale persistence snapshots', 'oversized snapshots', 'redundant writes', 'cross-tab conflict'],
      recovers: ['rejects stale snapshots', 'suppresses redundant writes', 'prepares deterministic replay'],
      escalation: 'clear corrupted runtime state only through the persistence engine',
    },
    {
      name: 'websocket-sync-recovery',
      owner: 'runtime-sync-engine',
      detects: ['stale authoritative payloads', 'duplicate subscriptions', 'overlapping hydration', 'reconnect storms'],
      recovers: ['rejects stale payloads', 'bounds active subscriptions', 'protects optimistic mutations'],
      escalation: 'surface websocket storm telemetry before runtime ownership is changed',
    },
    {
      name: 'optimistic-queue-recovery',
      owner: 'order-mutations-runtime',
      detects: ['unresolved mutations', 'duplicate mutation ids', 'rollback drift', 'queue age limit breach'],
      recovers: ['commits or rolls back through the mutation owner', 'keeps optimistic identity centralized'],
      escalation: 'investigate API/session/domain errors before touching UI rendering',
    },
  ];
}

export function buildEnterpriseTelemetrySnapshot(): EnterpriseTelemetrySnapshot {
  const releases = buildReleaseTelemetryRows();
  return {
    generatedAt: nowIso(),
    runtime: buildRuntimeTelemetrySnapshot(),
    deployment: buildDeploymentTelemetrySnapshot(),
    clientRuntime: buildClientRuntimeTelemetrySnapshot(),
    recoveryContracts: getEnterpriseRecoveryContracts(),
    releaseSummary: getReleaseTelemetrySummary(releases),
    tenantHealthRows: buildTenantObservabilityRows(),
    server: buildServerMetricSnapshot({
      postgres: { healthy: false, message: 'not probed in enterprise telemetry snapshot' },
      redis: { enabled: false, healthy: false, message: 'not probed in enterprise telemetry snapshot' },
    }),
    recentEnterpriseEvents: getRecentEnterpriseTelemetryEvents(100),
  };
}

export function bootstrapEnterpriseTelemetry() {
  if (getRecentEnterpriseTelemetryEvents(1).some((event) => event.message === 'Enterprise telemetry bootstrapped')) {
    return;
  }
  recordEnterpriseTelemetry({
    scope: 'runtime',
    severity: 'info',
    message: 'Enterprise telemetry bootstrapped',
    context: {
      runtimeBuildIdEndpoint: '/api/runtime-build-id',
      canonicalRuntime: 'adisyum-root-app',
      canonicalPort: '3000',
    },
  });
}
