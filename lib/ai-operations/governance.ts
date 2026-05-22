import { getAnomalyStats, getRecentAnomalies } from '@/lib/anomaly/detector';
import { buildEnterpriseTelemetrySnapshot } from '@/lib/observability/enterprise-telemetry';
import { buildScaleReadinessSnapshot } from '@/lib/operations/scale-readiness';
import { getHealingEvents, getHealingStats } from '@/lib/self-healing/engine';

export type AiOperationsSignal =
  | 'runtime-health'
  | 'deployment-health'
  | 'tenant-health'
  | 'database-health'
  | 'websocket-health'
  | 'reconciliation-health'
  | 'persistence-health'
  | 'queue-health'
  | 'memory-health';

export type AiOperationalRecommendation = {
  id: string;
  signal: AiOperationsSignal;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  recommendedAction: string;
  automation: 'manual-review' | 'safe-auto-recovery-eligible' | 'forbidden-auto-recovery';
};

export type AiOperationalScore = {
  runtimeHealth: number;
  deploymentHealth: number;
  tenantHealth: number;
  websocketHealth: number;
  reconciliationHealth: number;
  memoryHealth: number;
  persistenceHealth: number;
  operationalStability: number;
};

export type AiRecoveryBoundary = {
  action: string;
  allowed: boolean;
  reason: string;
  owner: string;
};

export type AiOperationsSnapshot = {
  generatedAt: string;
  governance: {
    centralizedOwner: 'ai-operations-governance';
    deterministic: true;
    deployAutomationAllowed: false;
    destructiveRecoveryAllowed: false;
  };
  telemetryAggregation: {
    runtimeMetrics: boolean;
    websocketMetrics: boolean;
    queueMetrics: boolean;
    reconciliationMetrics: boolean;
    deploymentMetrics: boolean;
    tenantHealthMetrics: boolean;
    mutationLifecycleMetrics: boolean;
  };
  anomalyDetection: ReturnType<typeof getAnomalyStats>;
  operationalScore: AiOperationalScore;
  recommendations: AiOperationalRecommendation[];
  safeRecoveryBoundaries: AiRecoveryBoundary[];
  forbiddenRecoveryBoundaries: AiRecoveryBoundary[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  if (!values.length) return 100;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function recommendation(input: Omit<AiOperationalRecommendation, 'id'>): AiOperationalRecommendation {
  return {
    id: `aiops-${input.signal}-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    ...input,
  };
}

export function getSafeRecoveryBoundaries(): AiRecoveryBoundary[] {
  return [
    { action: 'stale runtime cleanup', allowed: true, reason: 'Removes stale runtime artifacts without mutating business records.', owner: 'runtime-persistence-engine' },
    { action: 'stale snapshot invalidation', allowed: true, reason: 'Rejects invalid runtime snapshots through the persistence owner.', owner: 'runtime-persistence-engine' },
    { action: 'websocket reconnect throttling', allowed: true, reason: 'Bounds reconnect storms without changing order state.', owner: 'runtime-sync-engine' },
    { action: 'orphan subscription cleanup', allowed: true, reason: 'Cleans listener ownership without changing tenant data.', owner: 'runtime-event-bus' },
    { action: 'stale optimistic queue cleanup', allowed: true, reason: 'Uses mutation runtime lifecycle to resolve stale optimistic entries.', owner: 'order-mutations-runtime' },
    { action: 'runtime cache invalidation', allowed: true, reason: 'Invalidates runtime cache by revision/scope only.', owner: 'pos-runtime' },
    { action: 'bounded retry orchestration', allowed: true, reason: 'Retries finite queue jobs through existing queue ownership.', owner: 'queue-orchestration' },
  ];
}

export function getForbiddenRecoveryBoundaries(): AiRecoveryBoundary[] {
  return [
    { action: 'mutate production business data', allowed: false, reason: 'AI recommendations may not alter orders, products, payments, stock, or tenant records.', owner: 'human-operator' },
    { action: 'perform destructive migrations', allowed: false, reason: 'Schema/data migration requires explicit human migration governance.', owner: 'human-operator' },
    { action: 'delete tenant records', allowed: false, reason: 'Tenant deletion is a destructive business operation.', owner: 'human-operator' },
    { action: 'alter billing state', allowed: false, reason: 'Billing and subscription state require commercial authority.', owner: 'commercial-ops' },
    { action: 'alter reconciliation ownership', allowed: false, reason: 'Runtime ownership is canonical and must not be changed by AI.', owner: 'runtime-architecture' },
    { action: 'bypass tenant isolation', allowed: false, reason: 'Tenant isolation is a non-negotiable platform invariant.', owner: 'tenant-runtime-context' },
    { action: 'deploy automatically', allowed: false, reason: 'Deployments require deterministic deployment validation and explicit operator action.', owner: 'deployment-authority' },
  ];
}

export function buildAiOperationalScore(): AiOperationalScore {
  const enterprise = buildEnterpriseTelemetrySnapshot();
  const scale = buildScaleReadinessSnapshot();
  const anomalyStats = getAnomalyStats();
  const healingStats = getHealingStats();

  const runtimeHealth = clamp(100
    - enterprise.runtime.pressureSignals.recentErrorLogs * 2
    - healingStats.failed * 8
    - healingStats.inProgress * 4);
  const deploymentHealth = clamp(scale.productionReadiness.rollbackSafeDeployRequired ? 95 : 60);
  const tenantHealth = average(enterprise.tenantHealthRows.map((row) => Number(row.errorRate || 0) > 5 ? 70 : 95));
  const websocketHealth = average(enterprise.tenantHealthRows.map((row) => row.websocketHealth === 'degraded' ? 55 : 95));
  const reconciliationHealth = clamp(100 - anomalyStats.byType.sync_failures * 10);
  const memoryHealth = enterprise.runtime.pressureSignals.memoryPressure ? 65 : 95;
  const persistenceHealth = clamp(100 - anomalyStats.byType.sync_failures * 5 - anomalyStats.bySeverity.high * 4);
  const operationalStability = average([
    runtimeHealth,
    deploymentHealth,
    tenantHealth,
    websocketHealth,
    reconciliationHealth,
    memoryHealth,
    persistenceHealth,
  ]);

  return {
    runtimeHealth,
    deploymentHealth,
    tenantHealth,
    websocketHealth,
    reconciliationHealth,
    memoryHealth,
    persistenceHealth,
    operationalStability,
  };
}

export function buildAiOperationalRecommendations(): AiOperationalRecommendation[] {
  const enterprise = buildEnterpriseTelemetrySnapshot();
  const scale = buildScaleReadinessSnapshot();
  const anomalyStats = getAnomalyStats();
  const healingStats = getHealingStats();
  const recentAnomalies = getRecentAnomalies(25);
  const recommendations: AiOperationalRecommendation[] = [];

  if (enterprise.runtime.pressureSignals.memoryPressure) {
    recommendations.push(recommendation({
      signal: 'memory-health',
      severity: 'warning',
      title: 'Runtime memory pressure detected',
      detail: 'Heap usage crossed the Phase 9 memory pressure threshold.',
      recommendedAction: 'Inspect runtime snapshots, event listeners, and long-running sessions before scaling worker count.',
      automation: 'manual-review',
    }));
  }

  if (healingStats.inProgress || healingStats.failed) {
    recommendations.push(recommendation({
      signal: 'runtime-health',
      severity: healingStats.failed ? 'critical' : 'warning',
      title: 'Unresolved recovery activity',
      detail: `${healingStats.inProgress} recovery actions in progress and ${healingStats.failed} failed recovery actions.`,
      recommendedAction: 'Review self-healing events and confirm recovery owner before manual intervention.',
      automation: 'manual-review',
    }));
  }

  if (anomalyStats.byType.websocket_disconnects > 0) {
    recommendations.push(recommendation({
      signal: 'websocket-health',
      severity: 'warning',
      title: 'Websocket instability anomaly',
      detail: 'Recent anomaly signals include websocket disconnect patterns.',
      recommendedAction: 'Throttle reconnects through runtime sync engine and inspect tenant channel fanout.',
      automation: 'safe-auto-recovery-eligible',
    }));
  }

  if (anomalyStats.byType.sync_failures > 0) {
    recommendations.push(recommendation({
      signal: 'reconciliation-health',
      severity: 'warning',
      title: 'Sync or reconciliation pressure',
      detail: 'Sync failure anomalies may indicate reconciliation or device runtime pressure.',
      recommendedAction: 'Inspect optimistic queue age, stale payload rejection, and branch device health.',
      automation: 'manual-review',
    }));
  }

  if (!scale.productionReadiness.queueRetriesBounded || !scale.productionReadiness.deadLetterGoverned) {
    recommendations.push(recommendation({
      signal: 'queue-health',
      severity: 'critical',
      title: 'Queue governance drift',
      detail: 'One or more queue contracts lost bounded retry or dead-letter governance.',
      recommendedAction: 'Stop rollout and restore queue ownership contracts before enabling scale tests.',
      automation: 'forbidden-auto-recovery',
    }));
  }

  if (recentAnomalies.some((anomaly) => anomaly.type === 'tenant_traffic_spike')) {
    recommendations.push(recommendation({
      signal: 'tenant-health',
      severity: 'warning',
      title: 'Tenant traffic spike',
      detail: 'One or more tenants are above their rolling traffic baseline.',
      recommendedAction: 'Check tenant quota, websocket fanout, API latency, and queue depth before horizontal scaling.',
      automation: 'manual-review',
    }));
  }

  if (recommendations.length === 0) {
    recommendations.push(recommendation({
      signal: 'runtime-health',
      severity: 'info',
      title: 'No active operational anomaly',
      detail: 'AI operations did not detect a current anomaly from bounded telemetry.',
      recommendedAction: 'Continue standard runtime, deployment, queue, and tenant health monitoring.',
      automation: 'manual-review',
    }));
  }

  return recommendations;
}

export function buildAiOperationsSnapshot(): AiOperationsSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    governance: {
      centralizedOwner: 'ai-operations-governance',
      deterministic: true,
      deployAutomationAllowed: false,
      destructiveRecoveryAllowed: false,
    },
    telemetryAggregation: {
      runtimeMetrics: true,
      websocketMetrics: true,
      queueMetrics: true,
      reconciliationMetrics: true,
      deploymentMetrics: true,
      tenantHealthMetrics: true,
      mutationLifecycleMetrics: true,
    },
    anomalyDetection: getAnomalyStats(),
    operationalScore: buildAiOperationalScore(),
    recommendations: buildAiOperationalRecommendations(),
    safeRecoveryBoundaries: getSafeRecoveryBoundaries(),
    forbiddenRecoveryBoundaries: getForbiddenRecoveryBoundaries(),
  };
}

export function getAiOperationsDiagnostics() {
  const healingEvents = getHealingEvents(25);
  return {
    snapshot: buildAiOperationsSnapshot(),
    recentHealingEvents: healingEvents,
  };
}
