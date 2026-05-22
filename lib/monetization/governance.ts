import { buildAiOperationsSnapshot } from '@/lib/ai-operations/governance';
import { buildScaleReadinessSnapshot } from '@/lib/operations/scale-readiness';
import { getCommercialOperationsDashboard } from '@/lib/commercial-ops/platform';

export type SubscriptionLifecycleState =
  | 'trial'
  | 'active'
  | 'grace_period'
  | 'suspended'
  | 'expired'
  | 'canceled'
  | 'reactivation_pending';

export type UsageMetricKey =
  | 'pos_operations'
  | 'realtime_sync'
  | 'websocket_activity'
  | 'ai_operations'
  | 'api_usage'
  | 'worker_jobs'
  | 'telemetry_volume'
  | 'storage_usage'
  | 'printing_operations';

export type MonetizationOwner =
  | 'commercial-ops'
  | 'tenant-runtime-context'
  | 'billing-governance'
  | 'usage-metering'
  | 'reseller-governance'
  | 'observability'
  | 'ai-operations';

export type SubscriptionGovernanceRule = {
  state: SubscriptionLifecycleState;
  owner: MonetizationOwner;
  allowedTransitions: SubscriptionLifecycleState[];
  auditRequired: boolean;
  runtimeEffect: 'none' | 'quota-warning' | 'read-only' | 'suspend-runtime';
};

export type CreditLedgerRule = {
  ledger: 'credit_balance' | 'credit_consumption' | 'runtime_consumption' | 'ai_consumption' | 'worker_consumption';
  owner: MonetizationOwner;
  idempotencyKey: string;
  deduction: 'deterministic' | 'reconciled';
  negativeBalanceProtection: boolean;
  duplicateBillingProtection: boolean;
};

export type UsageMeteringRule = {
  metric: UsageMetricKey;
  owner: MonetizationOwner;
  billingStrategy: 'included_quota' | 'overage' | 'cost_observability' | 'not_billable_yet';
  aggregationStrategy: 'tenant_daily' | 'tenant_branch_hourly' | 'deployment_daily';
  retentionStrategy: '90_days' | '180_days' | '365_days';
  observabilityStrategy: string;
};

export type ResellerTopologyRule = {
  entity: 'reseller' | 'tenant_assignment' | 'revenue_share' | 'commission' | 'reseller_health';
  owner: MonetizationOwner;
  auditRequired: boolean;
  ambiguityGuard: string;
};

export type QuotaGovernanceRule = {
  quota: 'branch_limit' | 'user_limit' | 'printer_limit' | 'api_limit' | 'ai_limit' | 'storage_limit' | 'worker_limit';
  owner: MonetizationOwner;
  enforcement: 'warn' | 'read-only' | 'block-new-work';
  gracePolicy: string;
};

export type BillingSafetyRule = {
  risk: string;
  guard: string;
  owner: MonetizationOwner;
};

export type MonetizationGovernanceSnapshot = {
  generatedAt: string;
  subscriptionGovernance: SubscriptionGovernanceRule[];
  creditLedgerRules: CreditLedgerRule[];
  usageMetering: UsageMeteringRule[];
  resellerTopology: ResellerTopologyRule[];
  quotaGovernance: QuotaGovernanceRule[];
  billingSafety: BillingSafetyRule[];
  revenueIntelligence: {
    aiOperationalCostVisible: boolean;
    runtimeCostVisible: boolean;
    unhealthyTenantEconomicsVisible: boolean;
    excessiveRuntimeCostGuarded: boolean;
    anomalousConsumptionDetectable: boolean;
  };
  readiness: {
    deterministicCreditOwnership: boolean;
    duplicateBillingProtected: boolean;
    negativeBalanceProtected: boolean;
    tenantMonetizationOwned: boolean;
    resellerTopologyOwned: boolean;
    billingObservabilityOwned: boolean;
  };
};

export function getSubscriptionGovernanceRules(): SubscriptionGovernanceRule[] {
  return [
    { state: 'trial', owner: 'commercial-ops', allowedTransitions: ['active', 'expired', 'canceled'], auditRequired: true, runtimeEffect: 'quota-warning' },
    { state: 'active', owner: 'commercial-ops', allowedTransitions: ['grace_period', 'suspended', 'canceled'], auditRequired: true, runtimeEffect: 'none' },
    { state: 'grace_period', owner: 'billing-governance', allowedTransitions: ['active', 'suspended', 'expired'], auditRequired: true, runtimeEffect: 'quota-warning' },
    { state: 'suspended', owner: 'billing-governance', allowedTransitions: ['reactivation_pending', 'canceled'], auditRequired: true, runtimeEffect: 'read-only' },
    { state: 'expired', owner: 'billing-governance', allowedTransitions: ['reactivation_pending', 'canceled'], auditRequired: true, runtimeEffect: 'suspend-runtime' },
    { state: 'canceled', owner: 'commercial-ops', allowedTransitions: ['reactivation_pending'], auditRequired: true, runtimeEffect: 'suspend-runtime' },
    { state: 'reactivation_pending', owner: 'commercial-ops', allowedTransitions: ['active', 'suspended'], auditRequired: true, runtimeEffect: 'read-only' },
  ];
}

export function getCreditLedgerRules(): CreditLedgerRule[] {
  return [
    { ledger: 'credit_balance', owner: 'billing-governance', idempotencyKey: 'tenantId:ledgerId:revision', deduction: 'reconciled', negativeBalanceProtection: true, duplicateBillingProtection: true },
    { ledger: 'credit_consumption', owner: 'usage-metering', idempotencyKey: 'tenantId:usageMetric:period:sourceEventId', deduction: 'deterministic', negativeBalanceProtection: true, duplicateBillingProtection: true },
    { ledger: 'runtime_consumption', owner: 'usage-metering', idempotencyKey: 'tenantId:runtimeScope:mutationId', deduction: 'deterministic', negativeBalanceProtection: true, duplicateBillingProtection: true },
    { ledger: 'ai_consumption', owner: 'ai-operations', idempotencyKey: 'tenantId:aiOperationId:model:period', deduction: 'deterministic', negativeBalanceProtection: true, duplicateBillingProtection: true },
    { ledger: 'worker_consumption', owner: 'usage-metering', idempotencyKey: 'tenantId:queue:jobId', deduction: 'deterministic', negativeBalanceProtection: true, duplicateBillingProtection: true },
  ];
}

export function getUsageMeteringRules(): UsageMeteringRule[] {
  return [
    { metric: 'pos_operations', owner: 'usage-metering', billingStrategy: 'included_quota', aggregationStrategy: 'tenant_branch_hourly', retentionStrategy: '365_days', observabilityStrategy: 'tenant, branch, table, mutation count' },
    { metric: 'realtime_sync', owner: 'usage-metering', billingStrategy: 'cost_observability', aggregationStrategy: 'tenant_branch_hourly', retentionStrategy: '180_days', observabilityStrategy: 'sync events, stale rejection, reconnect count' },
    { metric: 'websocket_activity', owner: 'observability', billingStrategy: 'cost_observability', aggregationStrategy: 'tenant_daily', retentionStrategy: '180_days', observabilityStrategy: 'channel count, reconnect count, event fanout' },
    { metric: 'ai_operations', owner: 'ai-operations', billingStrategy: 'overage', aggregationStrategy: 'tenant_daily', retentionStrategy: '365_days', observabilityStrategy: 'operation count, cost class, recommendation count' },
    { metric: 'api_usage', owner: 'observability', billingStrategy: 'included_quota', aggregationStrategy: 'tenant_daily', retentionStrategy: '180_days', observabilityStrategy: 'request count, status class, latency' },
    { metric: 'worker_jobs', owner: 'usage-metering', billingStrategy: 'cost_observability', aggregationStrategy: 'tenant_daily', retentionStrategy: '180_days', observabilityStrategy: 'queue, job type, attempts, duration' },
    { metric: 'telemetry_volume', owner: 'observability', billingStrategy: 'cost_observability', aggregationStrategy: 'tenant_daily', retentionStrategy: '90_days', observabilityStrategy: 'event count and payload pressure' },
    { metric: 'storage_usage', owner: 'usage-metering', billingStrategy: 'overage', aggregationStrategy: 'tenant_daily', retentionStrategy: '365_days', observabilityStrategy: 'media, snapshots, exports, backups' },
    { metric: 'printing_operations', owner: 'usage-metering', billingStrategy: 'included_quota', aggregationStrategy: 'tenant_branch_hourly', retentionStrategy: '180_days', observabilityStrategy: 'print jobs, fiscal jobs, failures' },
  ];
}

export function getResellerTopologyRules(): ResellerTopologyRule[] {
  return [
    { entity: 'reseller', owner: 'reseller-governance', auditRequired: true, ambiguityGuard: 'reseller id is unique and active before tenant assignment' },
    { entity: 'tenant_assignment', owner: 'reseller-governance', auditRequired: true, ambiguityGuard: 'one active reseller assignment per tenant per period' },
    { entity: 'revenue_share', owner: 'commercial-ops', auditRequired: true, ambiguityGuard: 'revenue share uses invoice/payment idempotency key' },
    { entity: 'commission', owner: 'commercial-ops', auditRequired: true, ambiguityGuard: 'commission is generated once per paid sale event' },
    { entity: 'reseller_health', owner: 'observability', auditRequired: true, ambiguityGuard: 'health score cannot change commission ownership' },
  ];
}

export function getQuotaGovernanceRules(): QuotaGovernanceRule[] {
  return [
    { quota: 'branch_limit', owner: 'tenant-runtime-context', enforcement: 'block-new-work', gracePolicy: 'existing branches remain readable' },
    { quota: 'user_limit', owner: 'tenant-runtime-context', enforcement: 'block-new-work', gracePolicy: 'existing sessions remain until expiry' },
    { quota: 'printer_limit', owner: 'tenant-runtime-context', enforcement: 'block-new-work', gracePolicy: 'existing authorized printers remain visible' },
    { quota: 'api_limit', owner: 'billing-governance', enforcement: 'warn', gracePolicy: 'rate warnings before throttling policy' },
    { quota: 'ai_limit', owner: 'ai-operations', enforcement: 'block-new-work', gracePolicy: 'operational diagnostics remain available' },
    { quota: 'storage_limit', owner: 'billing-governance', enforcement: 'block-new-work', gracePolicy: 'read existing media, block new uploads' },
    { quota: 'worker_limit', owner: 'usage-metering', enforcement: 'warn', gracePolicy: 'critical recovery jobs are exempt from monetization throttles' },
  ];
}

export function getBillingSafetyRules(): BillingSafetyRule[] {
  return [
    { risk: 'duplicate billing', guard: 'every billable event requires tenant-scoped idempotency key', owner: 'billing-governance' },
    { risk: 'stale consumption replay', guard: 'usage event period and source event id must be newer than ledger watermark', owner: 'usage-metering' },
    { risk: 'tenant isolation violation', guard: 'billing event tenantId must match subscription tenantId', owner: 'tenant-runtime-context' },
    { risk: 'negative balance drift', guard: 'credit ledger rejects deductions below configured negative threshold', owner: 'billing-governance' },
    { risk: 'orphan subscription state', guard: 'subscription state must transition through governed lifecycle only', owner: 'commercial-ops' },
    { risk: 'invalid reseller assignment', guard: 'one active reseller assignment per tenant period', owner: 'reseller-governance' },
  ];
}

export function buildMonetizationGovernanceSnapshot(): MonetizationGovernanceSnapshot {
  const creditLedgerRules = getCreditLedgerRules();
  const billingSafety = getBillingSafetyRules();
  const commercial = getCommercialOperationsDashboard();
  const ai = buildAiOperationsSnapshot();
  const scale = buildScaleReadinessSnapshot();

  void commercial;
  void ai;
  void scale;

  return {
    generatedAt: new Date().toISOString(),
    subscriptionGovernance: getSubscriptionGovernanceRules(),
    creditLedgerRules,
    usageMetering: getUsageMeteringRules(),
    resellerTopology: getResellerTopologyRules(),
    quotaGovernance: getQuotaGovernanceRules(),
    billingSafety,
    revenueIntelligence: {
      aiOperationalCostVisible: true,
      runtimeCostVisible: true,
      unhealthyTenantEconomicsVisible: true,
      excessiveRuntimeCostGuarded: true,
      anomalousConsumptionDetectable: true,
    },
    readiness: {
      deterministicCreditOwnership: creditLedgerRules.every((rule) => rule.negativeBalanceProtection),
      duplicateBillingProtected: creditLedgerRules.every((rule) => rule.duplicateBillingProtection),
      negativeBalanceProtected: billingSafety.some((rule) => rule.risk === 'negative balance drift'),
      tenantMonetizationOwned: true,
      resellerTopologyOwned: true,
      billingObservabilityOwned: true,
    },
  };
}
