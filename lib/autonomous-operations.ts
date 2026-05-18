import { ROLLOUT_PLANS, releaseHealthSummary, type RolloutPlan } from '@/lib/release-governance';

export type PolicySeverity = 'info' | 'warning' | 'degraded' | 'critical' | 'outage';
export type PolicyActionType =
  | 'pause_rollout'
  | 'request_diagnostics'
  | 'create_incident'
  | 'quarantine_channel'
  | 'freeze_offline_replay'
  | 'require_operator_approval'
  | 'rollback_rollout';

export type OperationalSignal = {
  rolloutId?: string;
  tenantId?: string;
  branchId?: string;
  deviceId?: string;
  incidentRate: number;
  reconnectFailureRate: number;
  updateSuccessRate: number;
  failedUpdates: number;
  offlineQueueDepth: number;
  syncLagMs: number;
  printerFailureRate: number;
  bridgeDisconnects: number;
  fiscalTimeouts: number;
};

export type OperationalPolicy = {
  id: string;
  name: string;
  description: string;
  severity: PolicySeverity;
  cooldownMinutes: number;
  approvalRequired: boolean;
  condition: string;
  actions: PolicyActionType[];
};

export type PolicyDecision = {
  id: string;
  policyId: string;
  policyName: string;
  severity: PolicySeverity;
  triggered: boolean;
  reason: string;
  actions: Array<{
    type: PolicyActionType;
    status: 'recommended' | 'approval_required' | 'automatic';
    message: string;
  }>;
  correlationId: string;
  createdAt: string;
};

export type AutonomousRiskSignal = {
  scope: string;
  score: number;
  severity: PolicySeverity;
  evidence: string[];
  recommendation: string;
};

export const OPERATIONAL_POLICIES: OperationalPolicy[] = [
  {
    id: 'policy-rollout-incident-spike',
    name: 'Rollout incident spike protection',
    description: 'Pause rollout and create incident when post-update incidents rise above safe threshold.',
    severity: 'critical',
    cooldownMinutes: 15,
    approvalRequired: false,
    condition: 'incidentRate >= 2.0 OR failedUpdates >= 3',
    actions: ['pause_rollout', 'create_incident', 'request_diagnostics'],
  },
  {
    id: 'policy-reconnect-storm',
    name: 'Reconnect storm containment',
    description: 'Quarantine rollout channel when bridge reconnect failures indicate unstable field behavior.',
    severity: 'degraded',
    cooldownMinutes: 10,
    approvalRequired: false,
    condition: 'reconnectFailureRate >= 3.0 OR bridgeDisconnects >= 10',
    actions: ['quarantine_channel', 'create_incident', 'request_diagnostics'],
  },
  {
    id: 'policy-low-update-success',
    name: 'Low update success rollback gate',
    description: 'Require operator approval for rollback when update success drops below release safety floor.',
    severity: 'critical',
    cooldownMinutes: 30,
    approvalRequired: true,
    condition: 'updateSuccessRate < 95',
    actions: ['pause_rollout', 'require_operator_approval', 'rollback_rollout'],
  },
  {
    id: 'policy-offline-queue-protection',
    name: 'Offline queue replay protection',
    description: 'Freeze replay and request diagnostics when offline queue growth risks duplicate sync.',
    severity: 'critical',
    cooldownMinutes: 5,
    approvalRequired: false,
    condition: 'offlineQueueDepth >= 100 OR syncLagMs >= 300000',
    actions: ['freeze_offline_replay', 'request_diagnostics', 'create_incident'],
  },
  {
    id: 'policy-printer-fleet-instability',
    name: 'Printer fleet instability detector',
    description: 'Create incident and request diagnostics when printer failures spike across a tenant or branch.',
    severity: 'degraded',
    cooldownMinutes: 10,
    approvalRequired: false,
    condition: 'printerFailureRate >= 5.0',
    actions: ['create_incident', 'request_diagnostics'],
  },
  {
    id: 'policy-fiscal-timeout-burst',
    name: 'Fiscal timeout burst guard',
    description: 'Escalate fiscal timeout bursts and require approval before automated fiscal retries.',
    severity: 'critical',
    cooldownMinutes: 20,
    approvalRequired: true,
    condition: 'fiscalTimeouts >= 5',
    actions: ['create_incident', 'request_diagnostics', 'require_operator_approval'],
  },
];

const actionMessages: Record<PolicyActionType, string> = {
  pause_rollout: 'Rollout otomatik duraklatma icin isaretlendi.',
  request_diagnostics: 'Uzaktan diagnostik snapshot talebi olusturuldu.',
  create_incident: 'Operasyon olayi olusturulacak.',
  quarantine_channel: 'Rollout kanali karantinaya alinacak.',
  freeze_offline_replay: 'Offline replay gecici olarak dondurulacak.',
  require_operator_approval: 'Operator onayi gerekiyor.',
  rollback_rollout: 'Rollback plani hazirlanacak.',
};

export function deriveSignalsFromRollout(rollout: RolloutPlan): OperationalSignal {
  const targeted = Math.max(rollout.metrics.targetedDevices, 1);
  const failedRate = (rollout.metrics.failedUpdates / targeted) * 100;
  return {
    rolloutId: rollout.id,
    tenantId: rollout.targetTenantIds[0],
    incidentRate: rollout.metrics.failedUpdates + rollout.metrics.incompatibleDevices,
    reconnectFailureRate: rollout.component === 'bridge' ? 3.2 : 1.4,
    updateSuccessRate: (rollout.metrics.updatedDevices / targeted) * 100,
    failedUpdates: rollout.metrics.failedUpdates,
    offlineQueueDepth: rollout.component === 'bridge' && failedRate > 5 ? 120 : 18,
    syncLagMs: rollout.component === 'bridge' ? 180000 : 45000,
    printerFailureRate: rollout.component === 'agent' ? 6.5 : 1.2,
    bridgeDisconnects: rollout.component === 'bridge' ? 11 : 2,
    fiscalTimeouts: rollout.component === 'fiscal-adapter' ? 6 : 0,
  };
}

function evaluatePolicy(policy: OperationalPolicy, signal: OperationalSignal) {
  if (policy.id === 'policy-rollout-incident-spike') return signal.incidentRate >= 2 || signal.failedUpdates >= 3;
  if (policy.id === 'policy-reconnect-storm') return signal.reconnectFailureRate >= 3 || signal.bridgeDisconnects >= 10;
  if (policy.id === 'policy-low-update-success') return signal.updateSuccessRate < 95;
  if (policy.id === 'policy-offline-queue-protection') return signal.offlineQueueDepth >= 100 || signal.syncLagMs >= 300000;
  if (policy.id === 'policy-printer-fleet-instability') return signal.printerFailureRate >= 5;
  if (policy.id === 'policy-fiscal-timeout-burst') return signal.fiscalTimeouts >= 5;
  return false;
}

export function evaluateOperationalPolicies(signals: OperationalSignal[] = ROLLOUT_PLANS.map(deriveSignalsFromRollout)): PolicyDecision[] {
  const now = new Date().toISOString();
  const decisions: PolicyDecision[] = [];
  for (const signal of signals) {
    for (const policy of OPERATIONAL_POLICIES) {
      const triggered = evaluatePolicy(policy, signal);
      decisions.push({
        id: `decision-${policy.id}-${signal.rolloutId ?? signal.deviceId ?? 'platform'}`,
        policyId: policy.id,
        policyName: policy.name,
        severity: policy.severity,
        triggered,
        reason: triggered ? `${policy.condition} matched for ${signal.rolloutId ?? signal.tenantId ?? 'platform'}.` : `${policy.condition} not matched.`,
        actions: triggered ? policy.actions.map((type) => ({
          type,
          status: policy.approvalRequired || type === 'rollback_rollout' ? 'approval_required' : 'automatic',
          message: actionMessages[type],
        })) : [],
        correlationId: `auto-${signal.rolloutId ?? signal.deviceId ?? 'platform'}-${policy.id}`,
        createdAt: now,
      });
    }
  }
  return decisions;
}

export function autonomousOperationsSummary(decisions = evaluateOperationalPolicies()) {
  const triggered = decisions.filter((decision) => decision.triggered);
  return {
    policies: OPERATIONAL_POLICIES.length,
    evaluatedDecisions: decisions.length,
    triggeredDecisions: triggered.length,
    automaticActions: triggered.flatMap((decision) => decision.actions).filter((action) => action.status === 'automatic').length,
    approvalRequired: triggered.flatMap((decision) => decision.actions).filter((action) => action.status === 'approval_required').length,
    criticalSignals: triggered.filter((decision) => decision.severity === 'critical' || decision.severity === 'outage').length,
    releaseHealth: releaseHealthSummary(),
  };
}

export function buildAutonomousRiskSignals(decisions = evaluateOperationalPolicies()): AutonomousRiskSignal[] {
  const triggered = decisions.filter((decision) => decision.triggered);
  return triggered.map((decision) => ({
    scope: decision.correlationId,
    score: decision.severity === 'critical' ? 88 : decision.severity === 'degraded' ? 72 : 45,
    severity: decision.severity,
    evidence: [decision.reason, ...decision.actions.map((action) => action.message)],
    recommendation: decision.actions.some((action) => action.type === 'rollback_rollout')
      ? 'Rollback onayi alinmadan rollout genisletilmemeli.'
      : 'Otomatik aksiyonlari uygula ve incident timeline icinde izle.',
  }));
}

export function simulateChaosScenario(kind: 'reconnect_storm' | 'rollout_corruption' | 'printer_fleet_failure' | 'offline_replay_corruption' | 'bridge_crash_loop') {
  const base: OperationalSignal = {
    tenantId: 'ABN-48291',
    branchId: 'main',
    deviceId: `chaos-${kind}`,
    incidentRate: 0.5,
    reconnectFailureRate: 0.5,
    updateSuccessRate: 99,
    failedUpdates: 0,
    offlineQueueDepth: 10,
    syncLagMs: 10000,
    printerFailureRate: 0.2,
    bridgeDisconnects: 1,
    fiscalTimeouts: 0,
  };

  const signal: OperationalSignal = {
    ...base,
    ...(kind === 'reconnect_storm' ? { reconnectFailureRate: 8, bridgeDisconnects: 24 } : {}),
    ...(kind === 'rollout_corruption' ? { incidentRate: 4, updateSuccessRate: 72, failedUpdates: 9 } : {}),
    ...(kind === 'printer_fleet_failure' ? { printerFailureRate: 12 } : {}),
    ...(kind === 'offline_replay_corruption' ? { offlineQueueDepth: 280, syncLagMs: 520000 } : {}),
    ...(kind === 'bridge_crash_loop' ? { reconnectFailureRate: 6, bridgeDisconnects: 40, offlineQueueDepth: 140 } : {}),
  };

  const decisions = evaluateOperationalPolicies([signal]);
  return {
    kind,
    signal,
    summary: autonomousOperationsSummary(decisions),
    decisions: decisions.filter((decision) => decision.triggered),
    riskSignals: buildAutonomousRiskSignals(decisions),
  };
}
