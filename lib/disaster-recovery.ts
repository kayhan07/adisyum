import { autonomousOperationsSummary, evaluateOperationalPolicies } from '@/lib/autonomous-operations';
import { ROLLOUT_PLANS, releaseHealthSummary } from '@/lib/release-governance';

export type FailureDomainType = 'device' | 'branch' | 'tenant' | 'rollout_group' | 'infrastructure_region' | 'redis_cluster' | 'websocket_cluster' | 'orchestration_workers';
export type RecoveryMode = 'normal' | 'degraded' | 'offline_safe' | 'recovery' | 'readonly_emergency';
export type EscalationTier = 'local_incident' | 'tenant_incident' | 'infrastructure_incident' | 'regional_incident' | 'platform_emergency';
export type RegionStatus = 'healthy' | 'degraded' | 'isolated' | 'failover_ready' | 'recovery';
export type RecoveryActionType = 'isolate_domain' | 'enable_degraded_mode' | 'pause_replay' | 'promote_readonly' | 'request_operator_approval' | 'failover_region' | 'restart_workers' | 'rebuild_stream';

export type FailureDomain = {
  id: string;
  type: FailureDomainType;
  name: string;
  region: string;
  parentDomainId?: string;
  blastRadius: string[];
  isolationPolicy: string;
  recoveryMode: RecoveryMode;
  healthScore: number;
};

export type RegionHealth = {
  region: string;
  status: RegionStatus;
  primary: boolean;
  redis: 'healthy' | 'degraded' | 'down';
  websocket: 'healthy' | 'degraded' | 'down';
  database: 'healthy' | 'replica_lag' | 'failover_required';
  workers: 'healthy' | 'degraded' | 'stalled';
  queueBacklog: number;
  reconnectStormScore: number;
  lastCheckedAt: string;
};

export type RecoverySnapshot = {
  id: string;
  createdAt: string;
  mode: RecoveryMode;
  rolloutState: ReturnType<typeof releaseHealthSummary>;
  policyState: ReturnType<typeof autonomousOperationsSummary>;
  queueState: {
    orchestrationBacklog: number;
    offlineReplayFrozen: boolean;
    fiscalReplayFrozen: boolean;
    corruptedReplaySuspicions: number;
  };
  incidentState: {
    openIncidents: number;
    escalationTier: EscalationTier;
    affectedDomains: string[];
  };
  deviceState: {
    unstableDevices: number;
    bridgeStorms: number;
    staleStreams: number;
  };
};

export type RecoveryDecision = {
  id: string;
  domainId: string;
  severity: EscalationTier;
  mode: RecoveryMode;
  reason: string;
  actions: Array<{ type: RecoveryActionType; approvalRequired: boolean; message: string }>;
  blastRadius: string[];
  createdAt: string;
};

export const FAILURE_DOMAINS: FailureDomain[] = [
  {
    id: 'region-eu-central',
    type: 'infrastructure_region',
    name: 'EU Central Primary',
    region: 'eu-central',
    blastRadius: ['cloud-api', 'system-admin', 'primary-websocket', 'primary-redis'],
    isolationPolicy: 'Region failover requires operator approval and recovery snapshot.',
    recoveryMode: 'normal',
    healthScore: 94,
  },
  {
    id: 'redis-primary',
    type: 'redis_cluster',
    name: 'Primary Redis Cluster',
    region: 'eu-central',
    parentDomainId: 'region-eu-central',
    blastRadius: ['queues', 'presence', 'sse-streams', 'worker-coordination'],
    isolationPolicy: 'Queue workers enter backoff and degraded mode before replay resumes.',
    recoveryMode: 'degraded',
    healthScore: 78,
  },
  {
    id: 'ws-primary',
    type: 'websocket_cluster',
    name: 'Primary Realtime Cluster',
    region: 'eu-central',
    parentDomainId: 'region-eu-central',
    blastRadius: ['live-pos-sync', 'system-admin-streams', 'presence-heartbeat'],
    isolationPolicy: 'Clients switch to replay-safe reconnect and stale stream detection.',
    recoveryMode: 'degraded',
    healthScore: 81,
  },
  {
    id: 'tenant-abn-48291',
    type: 'tenant',
    name: 'ABN-48291 Tenant Domain',
    region: 'eu-central',
    parentDomainId: 'region-eu-central',
    blastRadius: ['tenant-orders', 'tenant-devices', 'tenant-offline-queues'],
    isolationPolicy: 'Tenant incidents must not affect sibling tenants.',
    recoveryMode: 'normal',
    healthScore: 88,
  },
  {
    id: 'workers-orchestration',
    type: 'orchestration_workers',
    name: 'Orchestration Worker Pool',
    region: 'eu-central',
    parentDomainId: 'redis-primary',
    blastRadius: ['onboarding-jobs', 'template-imports', 'analytics-aggregation', 'release-actions'],
    isolationPolicy: 'Stalled jobs move to recovery mode with retry storm protection.',
    recoveryMode: 'recovery',
    healthScore: 74,
  },
];

export const REGION_HEALTH: RegionHealth[] = [
  {
    region: 'eu-central',
    status: 'degraded',
    primary: true,
    redis: 'degraded',
    websocket: 'degraded',
    database: 'healthy',
    workers: 'degraded',
    queueBacklog: 420,
    reconnectStormScore: 62,
    lastCheckedAt: new Date().toISOString(),
  },
  {
    region: 'eu-west-standby',
    status: 'failover_ready',
    primary: false,
    redis: 'healthy',
    websocket: 'healthy',
    database: 'replica_lag',
    workers: 'healthy',
    queueBacklog: 0,
    reconnectStormScore: 8,
    lastCheckedAt: new Date().toISOString(),
  },
];

function escalationForDomain(domain: FailureDomain): EscalationTier {
  if (domain.healthScore < 55 || domain.recoveryMode === 'readonly_emergency') return 'platform_emergency';
  if (domain.type === 'infrastructure_region' && domain.healthScore < 80) return 'regional_incident';
  if (domain.type === 'redis_cluster' || domain.type === 'websocket_cluster' || domain.type === 'orchestration_workers') return 'infrastructure_incident';
  if (domain.type === 'tenant') return 'tenant_incident';
  return 'local_incident';
}

function actionsForDomain(domain: FailureDomain): RecoveryDecision['actions'] {
  if (domain.type === 'redis_cluster') {
    return [
      { type: 'enable_degraded_mode', approvalRequired: false, message: 'Redis degraded mode ve queue reconnect backoff etkinleştir.' },
      { type: 'pause_replay', approvalRequired: false, message: 'Offline/fiscal replay akışını doğrulama bitene kadar dondur.' },
      { type: 'request_operator_approval', approvalRequired: true, message: 'Redis failover veya cache flush için operator onayı iste.' },
    ];
  }
  if (domain.type === 'websocket_cluster') {
    return [
      { type: 'rebuild_stream', approvalRequired: false, message: 'Replay-safe reconnect ve stale stream temizliği başlat.' },
      { type: 'enable_degraded_mode', approvalRequired: false, message: 'Canlı izleme degraded mode ile çalışsın.' },
    ];
  }
  if (domain.type === 'orchestration_workers') {
    return [
      { type: 'restart_workers', approvalRequired: false, message: 'Worker pool kontrollü restart ve stuck job taraması başlat.' },
      { type: 'pause_replay', approvalRequired: false, message: 'Retry storm riskli queue replay akışını dondur.' },
    ];
  }
  if (domain.type === 'infrastructure_region') {
    return [
      { type: 'isolate_domain', approvalRequired: false, message: 'Bölgesel blast radius sınırlarını kilitle.' },
      { type: 'failover_region', approvalRequired: true, message: 'Standby region failover için operator onayı iste.' },
    ];
  }
  return [
    { type: 'isolate_domain', approvalRequired: false, message: 'Domain etkisini parent/sibling domainlerden izole et.' },
    { type: 'enable_degraded_mode', approvalRequired: false, message: 'Yerel degraded mode ile kritik işlemleri koru.' },
  ];
}

export function buildRecoveryDecisions(domains: FailureDomain[] = FAILURE_DOMAINS): RecoveryDecision[] {
  return domains
    .filter((domain) => domain.healthScore < 85 || domain.recoveryMode !== 'normal')
    .map((domain) => ({
      id: `recovery-${domain.id}`,
      domainId: domain.id,
      severity: escalationForDomain(domain),
      mode: domain.recoveryMode,
      reason: `${domain.name} health score ${domain.healthScore}; mode ${domain.recoveryMode}.`,
      actions: actionsForDomain(domain),
      blastRadius: domain.blastRadius,
      createdAt: new Date().toISOString(),
    }));
}

export function buildRecoverySnapshot(): RecoverySnapshot {
  const decisions = evaluateOperationalPolicies();
  const affectedDomains = buildRecoveryDecisions().map((decision) => decision.domainId);
  return {
    id: `recovery-snapshot-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode: affectedDomains.length ? 'degraded' : 'normal',
    rolloutState: releaseHealthSummary(),
    policyState: autonomousOperationsSummary(decisions),
    queueState: {
      orchestrationBacklog: REGION_HEALTH.reduce((sum, region) => sum + region.queueBacklog, 0),
      offlineReplayFrozen: true,
      fiscalReplayFrozen: true,
      corruptedReplaySuspicions: ROLLOUT_PLANS.reduce((sum, plan) => sum + plan.metrics.failedUpdates, 0),
    },
    incidentState: {
      openIncidents: buildRecoveryDecisions().length,
      escalationTier: affectedDomains.includes('region-eu-central') ? 'regional_incident' : 'infrastructure_incident',
      affectedDomains,
    },
    deviceState: {
      unstableDevices: releaseHealthSummary().incompatibleDevices,
      bridgeStorms: REGION_HEALTH.filter((region) => region.reconnectStormScore > 50).length,
      staleStreams: FAILURE_DOMAINS.filter((domain) => domain.type === 'websocket_cluster' && domain.healthScore < 90).length,
    },
  };
}

export function disasterRecoverySummary() {
  const decisions = buildRecoveryDecisions();
  return {
    domains: FAILURE_DOMAINS.length,
    degradedDomains: FAILURE_DOMAINS.filter((domain) => domain.recoveryMode !== 'normal' || domain.healthScore < 85).length,
    regions: REGION_HEALTH.length,
    degradedRegions: REGION_HEALTH.filter((region) => region.status !== 'healthy' && region.status !== 'failover_ready').length,
    approvalRequired: decisions.flatMap((decision) => decision.actions).filter((action) => action.approvalRequired).length,
    queueBacklog: REGION_HEALTH.reduce((sum, region) => sum + region.queueBacklog, 0),
    activeMode: decisions.some((decision) => decision.severity === 'regional_incident' || decision.severity === 'platform_emergency') ? 'recovery' : 'degraded',
  };
}

export function simulateRecoveryScenario(kind: 'redis_outage' | 'websocket_collapse' | 'worker_crash_storm' | 'db_reconnect_storm' | 'rollout_corruption' | 'replay_corruption' | 'region_isolation') {
  const domains = FAILURE_DOMAINS.map((domain) => ({ ...domain }));
  if (kind === 'redis_outage') {
    domains.find((domain) => domain.id === 'redis-primary')!.healthScore = 35;
    domains.find((domain) => domain.id === 'redis-primary')!.recoveryMode = 'readonly_emergency';
  }
  if (kind === 'websocket_collapse') {
    domains.find((domain) => domain.id === 'ws-primary')!.healthScore = 42;
    domains.find((domain) => domain.id === 'ws-primary')!.recoveryMode = 'recovery';
  }
  if (kind === 'worker_crash_storm') {
    domains.find((domain) => domain.id === 'workers-orchestration')!.healthScore = 39;
    domains.find((domain) => domain.id === 'workers-orchestration')!.recoveryMode = 'recovery';
  }
  if (kind === 'db_reconnect_storm' || kind === 'region_isolation') {
    domains.find((domain) => domain.id === 'region-eu-central')!.healthScore = kind === 'region_isolation' ? 28 : 58;
    domains.find((domain) => domain.id === 'region-eu-central')!.recoveryMode = kind === 'region_isolation' ? 'readonly_emergency' : 'recovery';
  }
  if (kind === 'rollout_corruption') {
    domains.find((domain) => domain.id === 'tenant-abn-48291')!.healthScore = 52;
    domains.find((domain) => domain.id === 'tenant-abn-48291')!.recoveryMode = 'offline_safe';
  }
  if (kind === 'replay_corruption') {
    domains.find((domain) => domain.id === 'tenant-abn-48291')!.healthScore = 45;
    domains.find((domain) => domain.id === 'workers-orchestration')!.healthScore = 50;
  }
  const decisions = buildRecoveryDecisions(domains);
  return {
    kind,
    decisions,
    safe: decisions.length > 0 && decisions.every((decision) => decision.actions.length > 0),
    approvals: decisions.flatMap((decision) => decision.actions).filter((action) => action.approvalRequired).length,
    blastRadius: [...new Set(decisions.flatMap((decision) => decision.blastRadius))],
  };
}
