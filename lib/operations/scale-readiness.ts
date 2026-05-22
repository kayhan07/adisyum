import { ORCHESTRATION_QUEUES, type OrchestrationQueueName } from '@/lib/queue/orchestration';

export type ScaleQueueOwner =
  | 'pos-runtime'
  | 'device-runtime'
  | 'system-admin'
  | 'observability'
  | 'tenant-operations'
  | 'deployment'
  | 'product-domain';

export type ScaleQueueContract = {
  queue: OrchestrationQueueName | 'print' | 'kitchen-print' | 'fiscal-device' | 'reconciliation-cleanup' | 'runtime-cleanup' | 'recovery';
  owner: ScaleQueueOwner;
  purpose: string;
  retry: {
    maxAttempts: number;
    backoff: 'exponential' | 'fixed';
    timeoutMs: number;
  };
  deadLetter: {
    strategy: 'retain-and-alert' | 'tenant-visible-review' | 'operator-clearance-required';
    retentionDays: number;
  };
  observability: string[];
};

export type WorkerOwnershipContract = {
  worker: string;
  owner: ScaleQueueOwner;
  handles: string[];
  mustNotHandle: string[];
  scalingRule: string;
};

export type TenantOperationContract = {
  operation: 'activation' | 'suspension' | 'migration' | 'isolation-verification' | 'quota-enforcement' | 'health-monitoring';
  owner: 'tenant-runtime-context' | 'system-admin' | 'commercial-ops' | 'operational-intelligence';
  auditRequired: boolean;
  scaleGuard: string;
};

export type CacheSegmentationContract = {
  cache: string;
  owner: ScaleQueueOwner;
  segmentation: 'tenant' | 'tenant-branch' | 'runtime-scope' | 'deployment';
  invalidation: string;
  leakageGuard: string;
};

export type RealtimeScaleContract = {
  owner: 'runtime-sync-engine' | 'runtime-event-bus' | 'tenant-events';
  signal: string;
  bound: string;
  observability: string;
};

export type ScaleReadinessSnapshot = {
  generatedAt: string;
  orchestrationQueues: readonly OrchestrationQueueName[];
  queueContracts: ScaleQueueContract[];
  workerContracts: WorkerOwnershipContract[];
  tenantOperations: TenantOperationContract[];
  cacheSegmentation: CacheSegmentationContract[];
  realtimeScale: RealtimeScaleContract[];
  productionReadiness: {
    horizontalRuntimeReady: boolean;
    rollbackSafeDeployRequired: boolean;
    tenantIsolationAuditable: boolean;
    queueRetriesBounded: boolean;
    deadLetterGoverned: boolean;
  };
};

export function getQueueOwnershipContracts(): ScaleQueueContract[] {
  return [
    {
      queue: 'onboarding',
      owner: 'tenant-operations',
      purpose: 'Tenant provisioning, activation, migration, and rollback work.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 120_000 },
      deadLetter: { strategy: 'operator-clearance-required', retentionDays: 14 },
      observability: ['attempt count', 'tenant id', 'provisioning job id', 'rollback count'],
    },
    {
      queue: 'template-import',
      owner: 'product-domain',
      purpose: 'Tenant-scoped product/template import work.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 180_000 },
      deadLetter: { strategy: 'tenant-visible-review', retentionDays: 14 },
      observability: ['tenant id', 'import id', 'failed row count', 'domain validation errors'],
    },
    {
      queue: 'analytics',
      owner: 'observability',
      purpose: 'Tenant-scoped analytics aggregation outside interactive runtime.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 90_000 },
      deadLetter: { strategy: 'retain-and-alert', retentionDays: 14 },
      observability: ['tenant id', 'aggregation window', 'latency', 'failure rate'],
    },
    {
      queue: 'stock-recalculation',
      owner: 'product-domain',
      purpose: 'Inventory and recipe recalculation work that must not block POS mutations.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 180_000 },
      deadLetter: { strategy: 'tenant-visible-review', retentionDays: 14 },
      observability: ['tenant id', 'branch id', 'stock mutation id', 'recalculation duration'],
    },
    {
      queue: 'report-generation',
      owner: 'system-admin',
      purpose: 'Long-running finance and operational report generation.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 300_000 },
      deadLetter: { strategy: 'retain-and-alert', retentionDays: 14 },
      observability: ['tenant id', 'report type', 'duration', 'output size'],
    },
    {
      queue: 'observability-aggregation',
      owner: 'observability',
      purpose: 'Telemetry aggregation and retention jobs.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 90_000 },
      deadLetter: { strategy: 'retain-and-alert', retentionDays: 14 },
      observability: ['aggregation window', 'retention run', 'dropped event count'],
    },
    {
      queue: 'ai-task',
      owner: 'system-admin',
      purpose: 'Non-interactive AI workloads isolated from POS runtime.',
      retry: { maxAttempts: 3, backoff: 'exponential', timeoutMs: 240_000 },
      deadLetter: { strategy: 'retain-and-alert', retentionDays: 7 },
      observability: ['tenant id', 'task type', 'token pressure', 'provider latency'],
    },
    {
      queue: 'notification',
      owner: 'system-admin',
      purpose: 'Email, webhook, and operational notification delivery.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 60_000 },
      deadLetter: { strategy: 'tenant-visible-review', retentionDays: 14 },
      observability: ['tenant id', 'channel', 'provider status', 'retry count'],
    },
    {
      queue: 'print',
      owner: 'device-runtime',
      purpose: 'Receipt printing through authorized local bridge sessions.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 45_000 },
      deadLetter: { strategy: 'tenant-visible-review', retentionDays: 14 },
      observability: ['tenant id', 'branch id', 'printer id', 'bridge id', 'attempt count'],
    },
    {
      queue: 'kitchen-print',
      owner: 'device-runtime',
      purpose: 'Kitchen ticket printing and KDS print fallback.',
      retry: { maxAttempts: 5, backoff: 'exponential', timeoutMs: 45_000 },
      deadLetter: { strategy: 'tenant-visible-review', retentionDays: 14 },
      observability: ['tenant id', 'branch id', 'station id', 'ticket id', 'attempt count'],
    },
    {
      queue: 'fiscal-device',
      owner: 'device-runtime',
      purpose: 'Fiscal device transactions that require deterministic tenant/device ownership.',
      retry: { maxAttempts: 3, backoff: 'exponential', timeoutMs: 90_000 },
      deadLetter: { strategy: 'operator-clearance-required', retentionDays: 30 },
      observability: ['tenant id', 'branch id', 'device id', 'transaction id', 'fiscal status'],
    },
    {
      queue: 'reconciliation-cleanup',
      owner: 'pos-runtime',
      purpose: 'Bounded cleanup of stale optimistic mutations and reconciliation artifacts.',
      retry: { maxAttempts: 3, backoff: 'fixed', timeoutMs: 30_000 },
      deadLetter: { strategy: 'retain-and-alert', retentionDays: 7 },
      observability: ['tenant id', 'table id', 'mutation age', 'cleanup count'],
    },
    {
      queue: 'runtime-cleanup',
      owner: 'pos-runtime',
      purpose: 'Stale snapshot, cache, and runtime persistence maintenance.',
      retry: { maxAttempts: 3, backoff: 'fixed', timeoutMs: 30_000 },
      deadLetter: { strategy: 'retain-and-alert', retentionDays: 7 },
      observability: ['tenant id', 'runtime scope', 'snapshot size', 'invalidated count'],
    },
    {
      queue: 'recovery',
      owner: 'deployment',
      purpose: 'Deployment drift recovery, rollback validation, and stale runtime cleanup.',
      retry: { maxAttempts: 2, backoff: 'fixed', timeoutMs: 120_000 },
      deadLetter: { strategy: 'operator-clearance-required', retentionDays: 30 },
      observability: ['runtime build id', 'git commit', 'pm2 process', 'nginx upstream'],
    },
  ];
}

export function getWorkerOwnershipContracts(): WorkerOwnershipContract[] {
  return [
    {
      worker: 'adisyum-worker',
      owner: 'system-admin',
      handles: ['orchestration queues', 'observability aggregation', 'tenant provisioning jobs'],
      mustNotHandle: ['React rendering', 'interactive POS mutations', 'nginx routing'],
      scalingRule: 'Scale by queue depth and tenant isolation pressure; keep idempotent job ids.',
    },
    {
      worker: 'local POS agent',
      owner: 'device-runtime',
      handles: ['receipt print queue', 'sync queue', 'fiscal transaction queue'],
      mustNotHandle: ['tenant provisioning', 'canonical product mutation', 'server reconciliation ownership'],
      scalingRule: 'One authorized bridge identity per tenant/branch/device runtime.',
    },
    {
      worker: 'runtime cleanup job',
      owner: 'pos-runtime',
      handles: ['stale snapshot cleanup', 'optimistic queue cleanup', 'runtime persistence maintenance'],
      mustNotHandle: ['product entity mutation', 'session ownership', 'printer ownership'],
      scalingRule: 'Shard by tenant runtime scope; never run as UI render side effect.',
    },
  ];
}

export function getTenantOperationContracts(): TenantOperationContract[] {
  return [
    { operation: 'activation', owner: 'system-admin', auditRequired: true, scaleGuard: 'idempotent provisioning job id' },
    { operation: 'suspension', owner: 'commercial-ops', auditRequired: true, scaleGuard: 'runtime suspension must preserve read-only tenant data' },
    { operation: 'migration', owner: 'tenant-runtime-context', auditRequired: true, scaleGuard: 'tenant scope proof before and after migration' },
    { operation: 'isolation-verification', owner: 'operational-intelligence', auditRequired: true, scaleGuard: 'tenant-scoped indexes and cache prefixes verified' },
    { operation: 'quota-enforcement', owner: 'commercial-ops', auditRequired: true, scaleGuard: 'quota decision logged before runtime restriction' },
    { operation: 'health-monitoring', owner: 'operational-intelligence', auditRequired: true, scaleGuard: 'tenant health rows stay bounded and observable' },
  ];
}

export function getCacheSegmentationContracts(): CacheSegmentationContract[] {
  return [
    { cache: 'runtime catalog cache', owner: 'pos-runtime', segmentation: 'tenant-branch', invalidation: 'catalog revision change', leakageGuard: 'tenantId and branchId required in cache key' },
    { cache: 'runtime table snapshot cache', owner: 'pos-runtime', segmentation: 'runtime-scope', invalidation: 'order revision or stale snapshot rejection', leakageGuard: 'runtime scope includes tenant and table identity' },
    { cache: 'tenant session cache', owner: 'tenant-operations', segmentation: 'tenant', invalidation: 'session revocation or tenant suspension', leakageGuard: 'no localhost or demo tenant fallback' },
    { cache: 'observability cache', owner: 'observability', segmentation: 'tenant', invalidation: 'retention window and aggregation run', leakageGuard: 'tenant rows never merged without tenant id' },
    { cache: 'deployment artifact cache', owner: 'deployment', segmentation: 'deployment', invalidation: 'runtime-build-id mismatch or fresh deploy', leakageGuard: 'active commit must match live runtime proof' },
  ];
}

export function getRealtimeScaleContracts(): RealtimeScaleContract[] {
  return [
    {
      owner: 'runtime-sync-engine',
      signal: 'authoritative sync overlap',
      bound: 'one in-flight reconciliation per runtime scope',
      observability: 'sync suppression count and stale payload rejection count',
    },
    {
      owner: 'runtime-event-bus',
      signal: 'event bus fanout',
      bound: 'bounded listener count and duplicate event suppression',
      observability: 'listener count, emission count, suppression count',
    },
    {
      owner: 'tenant-events',
      signal: 'tenant realtime fanout',
      bound: 'tenant-prefixed channels only',
      observability: 'tenant channel health and websocket reconnect count',
    },
  ];
}

export function buildScaleReadinessSnapshot(): ScaleReadinessSnapshot {
  const queueContracts = getQueueOwnershipContracts();
  const boundedRetries = queueContracts.every((queue) => queue.retry.maxAttempts > 0 && queue.retry.maxAttempts <= 5);
  const deadLetterGoverned = queueContracts.every((queue) => queue.deadLetter.retentionDays > 0 && queue.observability.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    orchestrationQueues: ORCHESTRATION_QUEUES,
    queueContracts,
    workerContracts: getWorkerOwnershipContracts(),
    tenantOperations: getTenantOperationContracts(),
    cacheSegmentation: getCacheSegmentationContracts(),
    realtimeScale: getRealtimeScaleContracts(),
    productionReadiness: {
      horizontalRuntimeReady: true,
      rollbackSafeDeployRequired: true,
      tenantIsolationAuditable: true,
      queueRetriesBounded: boundedRetries,
      deadLetterGoverned,
    },
  };
}
