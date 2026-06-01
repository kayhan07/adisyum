import { DEVICE_CERTIFICATION_MATRIX, certificationSummary, type CertificationStatus } from '@/lib/device-certification';

export type ReleaseChannel = 'internal' | 'pilot' | 'beta' | 'certified' | 'general';
export type VersionComponent = 'cloud' | 'desktop' | 'bridge' | 'agent' | 'fiscal-adapter';
export type RolloutStatus = 'draft' | 'active' | 'paused' | 'completed' | 'rolled_back';

export type VersionRegistryEntry = {
  component: VersionComponent;
  version: string;
  channel: ReleaseChannel;
  minCloudVersion?: string;
  minDesktopVersion?: string;
  minBridgeVersion?: string;
  minAgentVersion?: string;
  supportedHardwareStatuses: CertificationStatus[];
  releaseDate: string;
  health: {
    updateSuccessRate: number;
    rollbackRate: number;
    reconnectFailureRate: number;
    postUpdateIncidentRate: number;
  };
  notes: string[];
};

export type CompatibilityRule = {
  id: string;
  sourceComponent: VersionComponent;
  sourceVersion: string;
  targetComponent: VersionComponent;
  minTargetVersion?: string;
  maxTargetVersion?: string;
  severity: 'info' | 'warning' | 'blocker';
  reason: string;
};

export type RolloutPlan = {
  id: string;
  name: string;
  component: VersionComponent;
  version: string;
  channel: ReleaseChannel;
  status: RolloutStatus;
  targetTenantIds: string[];
  targetPercent: number;
  startedAt?: string;
  pausedAt?: string;
  rollbackVersion?: string;
  safetyGates: string[];
  metrics: {
    targetedDevices: number;
    updatedDevices: number;
    failedUpdates: number;
    rollbackEvents: number;
    incompatibleDevices: number;
  };
};

export type CompatibilityCheck = {
  ok: boolean;
  blockers: CompatibilityRule[];
  warnings: CompatibilityRule[];
  installed: Partial<Record<VersionComponent, string>>;
};

export type ReleaseDiagnosticSnapshot = {
  id: string;
  tenantId?: string;
  bridgeId?: string;
  requestedAt: string;
  bridgeState: string;
  spoolState: string;
  printerState: string;
  queueHealth: string;
  syncLagMs: number;
  fiscalAdapterStatus: string;
  installedVersions: Partial<Record<VersionComponent, string>>;
  findings: string[];
};

export const VERSION_REGISTRY: VersionRegistryEntry[] = [
  {
    component: 'cloud',
    version: '2026.05.19',
    channel: 'general',
    supportedHardwareStatuses: ['Certified', 'Beta'],
    releaseDate: '2026-05-19',
    health: {
      updateSuccessRate: 99.2,
      rollbackRate: 0.2,
      reconnectFailureRate: 0.4,
      postUpdateIncidentRate: 0.3,
    },
    notes: ['System-admin operations, desktop bridge telemetry, and field diagnostics are supported.'],
  },
  {
    component: 'desktop',
    version: '1.0.0',
    channel: 'pilot',
    minCloudVersion: '2026.05.19',
    minBridgeVersion: '1.0.0',
    supportedHardwareStatuses: ['Certified', 'Beta'],
    releaseDate: '2026-05-19',
    health: {
      updateSuccessRate: 97.5,
      rollbackRate: 0.8,
      reconnectFailureRate: 1.4,
      postUpdateIncidentRate: 0.9,
    },
    notes: ['Electron shell, support center, diagnostics panel, and bridge status probes are enabled.'],
  },
  {
    component: 'bridge',
    version: '1.0.0',
    channel: 'pilot',
    minCloudVersion: '2026.05.19',
    minDesktopVersion: '1.0.0',
    supportedHardwareStatuses: ['Certified', 'Beta'],
    releaseDate: '2026-05-19',
    health: {
      updateSuccessRate: 96.8,
      rollbackRate: 1.1,
      reconnectFailureRate: 1.6,
      postUpdateIncidentRate: 1.2,
    },
    notes: ['Offline queue mutation IDs, fiscal replay protection, and printer diagnostics are required.'],
  },
  {
    component: 'agent',
    version: '1.0.0',
    channel: 'pilot',
    minCloudVersion: '2026.05.19',
    minBridgeVersion: '1.0.0',
    supportedHardwareStatuses: ['Certified', 'Beta', 'Experimental'],
    releaseDate: '2026-05-19',
    health: {
      updateSuccessRate: 95.9,
      rollbackRate: 1.4,
      reconnectFailureRate: 1.8,
      postUpdateIncidentRate: 1.5,
    },
    notes: ['Local print agent requires bridge 1.0.0 or newer for signed localhost commands.'],
  },
  {
    component: 'fiscal-adapter',
    version: '0.5.0',
    channel: 'internal',
    minCloudVersion: '2026.05.19',
    minBridgeVersion: '1.0.0',
    supportedHardwareStatuses: ['Experimental'],
    releaseDate: '2026-05-19',
    health: {
      updateSuccessRate: 92.4,
      rollbackRate: 3.5,
      reconnectFailureRate: 3.8,
      postUpdateIncidentRate: 4.1,
    },
    notes: ['Vendor SDK adapters stay internal until device-specific fiscal certification is completed.'],
  },
];

export const COMPATIBILITY_RULES: CompatibilityRule[] = [
  {
    id: 'desktop-requires-cloud-2026-05-19',
    sourceComponent: 'desktop',
    sourceVersion: '1.0.0',
    targetComponent: 'cloud',
    minTargetVersion: '2026.05.19',
    severity: 'blocker',
    reason: 'Desktop diagnostics and release telemetry require the current cloud telemetry endpoints.',
  },
  {
    id: 'desktop-requires-bridge-1',
    sourceComponent: 'desktop',
    sourceVersion: '1.0.0',
    targetComponent: 'bridge',
    minTargetVersion: '1.0.0',
    severity: 'blocker',
    reason: 'Desktop printing and diagnostics depend on bridge status and signed command endpoints.',
  },
  {
    id: 'agent-requires-bridge-1',
    sourceComponent: 'agent',
    sourceVersion: '1.0.0',
    targetComponent: 'bridge',
    minTargetVersion: '1.0.0',
    severity: 'warning',
    reason: 'Print agent can start alone, but offline queue replay protection is only complete with bridge 1.0.0.',
  },
  {
    id: 'fiscal-adapter-internal-only',
    sourceComponent: 'fiscal-adapter',
    sourceVersion: '0.5.0',
    targetComponent: 'bridge',
    minTargetVersion: '1.0.0',
    severity: 'blocker',
    reason: 'Fiscal adapters are not eligible for general release before vendor certification.',
  },
];

export const ROLLOUT_PLANS: RolloutPlan[] = [
  {
    id: 'rollout-desktop-1-pilot',
    name: 'Adisyum Desktop 1.0 Pilot',
    component: 'desktop',
    version: '1.0.0',
    channel: 'pilot',
    status: 'active',
    targetTenantIds: ['TNT-SAMPLE-0000'],
    targetPercent: 10,
    startedAt: '2026-05-19T09:00:00.000Z',
    rollbackVersion: '0.9.0',
    safetyGates: [
      'Update success rate >= 95%',
      'Post-update incident rate <= 2%',
      'No certified printer regression',
      'No fiscal queue duplicate replay',
    ],
    metrics: {
      targetedDevices: 12,
      updatedDevices: 8,
      failedUpdates: 1,
      rollbackEvents: 0,
      incompatibleDevices: 1,
    },
  },
  {
    id: 'rollout-bridge-1-pilot',
    name: 'Bridge Service 1.0 Pilot',
    component: 'bridge',
    version: '1.0.0',
    channel: 'pilot',
    status: 'active',
    targetTenantIds: ['TNT-SAMPLE-0000'],
    targetPercent: 10,
    startedAt: '2026-05-19T09:15:00.000Z',
    rollbackVersion: '0.9.0',
    safetyGates: [
      'Bridge heartbeat latency < 1500ms',
      'Spool failure rate <= 1%',
      'Offline queue replay guard active',
      'Rollback package available',
    ],
    metrics: {
      targetedDevices: 10,
      updatedDevices: 7,
      failedUpdates: 1,
      rollbackEvents: 0,
      incompatibleDevices: 1,
    },
  },
];

function compareVersions(left: string, right: string) {
  const a = left.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split(/[.-]/).map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function ruleApplies(rule: CompatibilityRule, installed: Partial<Record<VersionComponent, string>>) {
  const source = installed[rule.sourceComponent];
  if (!source) return false;
  return compareVersions(source, rule.sourceVersion) >= 0;
}

function targetViolates(rule: CompatibilityRule, installed: Partial<Record<VersionComponent, string>>) {
  const target = installed[rule.targetComponent];
  if (!target) return true;
  if (rule.minTargetVersion && compareVersions(target, rule.minTargetVersion) < 0) return true;
  if (rule.maxTargetVersion && compareVersions(target, rule.maxTargetVersion) > 0) return true;
  return false;
}

export function validateVersionCompatibility(installed: Partial<Record<VersionComponent, string>>): CompatibilityCheck {
  const violations = COMPATIBILITY_RULES.filter((rule) => ruleApplies(rule, installed) && targetViolates(rule, installed));
  return {
    ok: violations.every((rule) => rule.severity !== 'blocker'),
    blockers: violations.filter((rule) => rule.severity === 'blocker'),
    warnings: violations.filter((rule) => rule.severity !== 'blocker'),
    installed,
  };
}

export function releaseHealthSummary() {
  const totalDevices = ROLLOUT_PLANS.reduce((sum, plan) => sum + plan.metrics.targetedDevices, 0);
  const updatedDevices = ROLLOUT_PLANS.reduce((sum, plan) => sum + plan.metrics.updatedDevices, 0);
  const failedUpdates = ROLLOUT_PLANS.reduce((sum, plan) => sum + plan.metrics.failedUpdates, 0);
  const rollbackEvents = ROLLOUT_PLANS.reduce((sum, plan) => sum + plan.metrics.rollbackEvents, 0);
  const incompatibleDevices = ROLLOUT_PLANS.reduce((sum, plan) => sum + plan.metrics.incompatibleDevices, 0);
  const certification = certificationSummary();
  return {
    totalDevices,
    updatedDevices,
    failedUpdates,
    rollbackEvents,
    incompatibleDevices,
    updateSuccessRate: totalDevices ? Math.round((updatedDevices / totalDevices) * 1000) / 10 : 100,
    activeRollouts: ROLLOUT_PLANS.filter((plan) => plan.status === 'active').length,
    pausedRollouts: ROLLOUT_PLANS.filter((plan) => plan.status === 'paused').length,
    certification,
    certifiedHardwareCount: DEVICE_CERTIFICATION_MATRIX.filter((item) => item.status === 'Certified').length,
  };
}

export function buildDiagnosticSnapshot(input: { tenantId?: string; bridgeId?: string; installedVersions?: Partial<Record<VersionComponent, string>> } = {}): ReleaseDiagnosticSnapshot {
  const installedVersions = input.installedVersions ?? {
    cloud: '2026.05.19',
    desktop: '1.0.0',
    bridge: '1.0.0',
    agent: '1.0.0',
  };
  const compatibility = validateVersionCompatibility(installedVersions);
  return {
    id: `diag-${Date.now()}`,
    tenantId: input.tenantId,
    bridgeId: input.bridgeId,
    requestedAt: new Date().toISOString(),
    bridgeState: compatibility.ok ? 'healthy' : 'compatibility_attention_required',
    spoolState: 'ready',
    printerState: 'last_known_online',
    queueHealth: 'draining',
    syncLagMs: 420,
    fiscalAdapterStatus: installedVersions['fiscal-adapter'] ? 'experimental_enabled' : 'not_configured',
    installedVersions,
    findings: [
      compatibility.ok ? 'No blocking compatibility issue detected.' : 'Blocking compatibility issue detected.',
      ...compatibility.blockers.map((rule) => rule.reason),
      ...compatibility.warnings.map((rule) => rule.reason),
    ],
  };
}

export function buildRollbackPlan(scope: { tenantId?: string; branchId?: string; deviceGroup?: string; component?: VersionComponent }) {
  const plans = ROLLOUT_PLANS.filter((plan) => !scope.component || plan.component === scope.component);
  return {
    id: `rollback-${Date.now()}`,
    createdAt: new Date().toISOString(),
    scope,
    eligibleRollouts: plans.map((plan) => ({
      rolloutId: plan.id,
      component: plan.component,
      currentVersion: plan.version,
      rollbackVersion: plan.rollbackVersion ?? 'manual_review_required',
      affectedDevices: plan.metrics.updatedDevices,
    })),
    safetyChecklist: [
      'Pause active rollout before rollback.',
      'Verify offline queue is idle or replay-protected.',
      'Capture diagnostics snapshot before downgrade.',
      'Rollback by tenant, branch, or device group; avoid platform-wide emergency rollback unless required.',
    ],
  };
}
