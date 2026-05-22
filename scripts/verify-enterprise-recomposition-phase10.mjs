import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const warnings = [];

function read(file) {
  const absolute = path.join(root, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : '';
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

const requiredDocs = [
  'SAAS_MONETIZATION_ARCHITECTURE.md',
  'SUBSCRIPTION_LIFECYCLE_GOVERNANCE.md',
  'CREDIT_AND_USAGE_LEDGER_TOPOLOGY.md',
  'RESELLER_OPERATIONAL_GOVERNANCE.md',
  'BILLING_OBSERVABILITY_ARCHITECTURE.md',
  'QUOTA_AND_LIMIT_ENFORCEMENT.md',
  'USAGE_METERING_FORENSICS.md',
  'AI_OPERATION_COST_GOVERNANCE.md',
];

for (const doc of requiredDocs) assert(exists(doc), `Missing Phase 10 monetization document: ${doc}`);

const packageJson = JSON.parse(read('package.json') || '{}');
assert(Boolean(packageJson.scripts?.['recomposition:phase10-validate']), 'Missing package script: recomposition:phase10-validate');

const monetization = read('lib/monetization/governance.ts');
assert(/buildMonetizationGovernanceSnapshot/.test(monetization), 'Monetization governance must expose buildMonetizationGovernanceSnapshot');
assert(/getSubscriptionGovernanceRules/.test(monetization), 'Subscription governance must exist');
assert(/getCreditLedgerRules/.test(monetization), 'Credit ledger governance must exist');
assert(/getUsageMeteringRules/.test(monetization), 'Usage metering governance must exist');
assert(/getResellerTopologyRules/.test(monetization), 'Reseller topology governance must exist');
assert(/getQuotaGovernanceRules/.test(monetization), 'Quota governance must exist');
assert(/getBillingSafetyRules/.test(monetization), 'Billing safety rules must exist');
assert(/negativeBalanceProtection:\s*true/.test(monetization), 'Credit governance must protect negative balances');
assert(/duplicateBillingProtection:\s*true/.test(monetization), 'Credit governance must protect duplicate billing');
assert(/tenantId:usageMetric:period:sourceEventId/.test(monetization), 'Usage metering must define deterministic idempotency keys');
assert(/one active reseller assignment per tenant per period/.test(monetization), 'Reseller topology must prevent assignment ambiguity');
assert(/commission is generated once per paid sale event/.test(monetization), 'Commission ownership must prevent duplicate commission billing');
assert(/billing event tenantId must match subscription tenantId/.test(monetization), 'Billing safety must protect tenant isolation');
assert(/credit ledger rejects deductions below configured negative threshold/.test(monetization), 'Billing safety must protect negative balance drift');
assert(/aiOperationalCostVisible:\s*true/.test(monetization), 'AI operation cost governance must be visible');
assert(/runtimeCostVisible:\s*true/.test(monetization), 'Runtime cost governance must be visible');

const usageMetrics = [
  'pos_operations',
  'realtime_sync',
  'websocket_activity',
  'ai_operations',
  'api_usage',
  'worker_jobs',
  'telemetry_volume',
  'storage_usage',
  'printing_operations',
];
for (const metric of usageMetrics) {
  assert(monetization.includes(`metric: '${metric}'`), `Usage metering missing metric: ${metric}`);
}

const schema = read('prisma/schema.prisma');
assert(/model Subscription/.test(schema), 'Database schema must include Subscription model');
assert(/@@index\(\[tenantId, status\]\)/.test(schema), 'Subscription must index tenant/status ownership');
assert(/@@index\(\[tenantId, endsAt\]\)/.test(schema), 'Subscription must index tenant expiration ownership');
assert(/@@unique\(\[tenantId, id\]/.test(schema), 'Subscription must have tenant-scoped unique ownership');

const commercialOps = read('lib/commercial-ops/platform.ts');
assert(/LicensePolicy/.test(commercialOps), 'Commercial operations must define license policy');
assert(/upsertLicense/.test(commercialOps), 'Commercial operations must expose license updates');
assert(/resellerMetrics/.test(commercialOps), 'Commercial operations must expose reseller metrics');
assert(/commissionPending/.test(commercialOps), 'Commercial operations must expose commission ownership');

const observabilityRoute = read('app/api/system-admin/observability/route.ts');
assert(/buildMonetizationGovernanceSnapshot/.test(observabilityRoute), 'System-admin observability must expose monetization governance');
assert(/monetizationGovernance/.test(observabilityRoute), 'System-admin observability response must include monetizationGovernance');

const aiOps = read('lib/ai-operations/governance.ts');
assert(/alter billing state/.test(aiOps), 'AI operations must forbid autonomous billing state changes');

const docsText = requiredDocs.map((doc) => read(doc)).join('\n');
for (const phrase of [
  'Every billing event must be tenant-scoped and idempotent',
  'Credit deduction must be deterministic and negative-balance protected',
  'Every usage metric must have owner, billing strategy, aggregation, retention, and observability',
  'Reseller assignment must have one active owner per tenant period',
  'No rewrite is introduced in Phase 10',
  'AI may recommend revenue action but must not alter billing state',
]) {
  assert(docsText.includes(phrase), `Phase 10 docs must include rule: ${phrase}`);
}

const report = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  phase: 'phase-10-revenue-automation-billing-governance-saas-monetization',
  diagnostics: {
    monetizationGovernance: Boolean(monetization),
    subscriptionGovernance: /getSubscriptionGovernanceRules/.test(monetization),
    usageMetering: /getUsageMeteringRules/.test(monetization),
    resellerTopology: /getResellerTopologyRules/.test(monetization),
    quotaGovernance: /getQuotaGovernanceRules/.test(monetization),
    billingSafety: /getBillingSafetyRules/.test(monetization),
  },
  warnings,
  failures,
};

if (!/model .*Credit|model .*Usage|model .*Billing|model .*Reseller/.test(schema)) {
  warn('Dedicated credit/usage/billing/reseller ledger tables are not yet present; Phase 10 records canonical ownership contracts without destructive migrations.');
}

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
