const scenarios = {
  reconnect_storm: { reconnectFailureRate: 8, bridgeDisconnects: 24, updateSuccessRate: 99, failedUpdates: 0, offlineQueueDepth: 10, syncLagMs: 10000, printerFailureRate: 0.2, fiscalTimeouts: 0, incidentRate: 0.5 },
  rollout_corruption: { reconnectFailureRate: 2, bridgeDisconnects: 4, updateSuccessRate: 72, failedUpdates: 9, offlineQueueDepth: 20, syncLagMs: 20000, printerFailureRate: 1, fiscalTimeouts: 0, incidentRate: 4 },
  printer_fleet_failure: { reconnectFailureRate: 1, bridgeDisconnects: 1, updateSuccessRate: 98, failedUpdates: 0, offlineQueueDepth: 10, syncLagMs: 10000, printerFailureRate: 12, fiscalTimeouts: 0, incidentRate: 0.5 },
  offline_replay_corruption: { reconnectFailureRate: 1, bridgeDisconnects: 1, updateSuccessRate: 98, failedUpdates: 0, offlineQueueDepth: 280, syncLagMs: 520000, printerFailureRate: 0.2, fiscalTimeouts: 0, incidentRate: 0.5 },
  bridge_crash_loop: { reconnectFailureRate: 6, bridgeDisconnects: 40, updateSuccessRate: 98, failedUpdates: 0, offlineQueueDepth: 140, syncLagMs: 160000, printerFailureRate: 1, fiscalTimeouts: 0, incidentRate: 1 },
};

const policies = [
  { id: 'incident_spike', when: (s) => s.incidentRate >= 2 || s.failedUpdates >= 3, actions: ['pause_rollout', 'create_incident', 'request_diagnostics'] },
  { id: 'reconnect_storm', when: (s) => s.reconnectFailureRate >= 3 || s.bridgeDisconnects >= 10, actions: ['quarantine_channel', 'create_incident', 'request_diagnostics'] },
  { id: 'low_update_success', when: (s) => s.updateSuccessRate < 95, actions: ['pause_rollout', 'require_operator_approval', 'rollback_rollout'] },
  { id: 'offline_queue_protection', when: (s) => s.offlineQueueDepth >= 100 || s.syncLagMs >= 300000, actions: ['freeze_offline_replay', 'request_diagnostics', 'create_incident'] },
  { id: 'printer_fleet_instability', when: (s) => s.printerFailureRate >= 5, actions: ['create_incident', 'request_diagnostics'] },
  { id: 'fiscal_timeout_burst', when: (s) => s.fiscalTimeouts >= 5, actions: ['create_incident', 'request_diagnostics', 'require_operator_approval'] },
];

let failures = 0;

for (const [name, signal] of Object.entries(scenarios)) {
  const triggered = policies.filter((policy) => policy.when(signal));
  const ok = triggered.length > 0;
  if (!ok) failures += 1;
  console.log(JSON.stringify({
    scenario: name,
    ok,
    triggeredPolicies: triggered.map((policy) => policy.id),
    actions: [...new Set(triggered.flatMap((policy) => policy.actions))],
  }));
}

if (failures > 0) {
  console.error(`Autonomous operations chaos simulation failed: ${failures} scenario(s) produced no policy action.`);
  process.exit(1);
}

console.log('Autonomous operations chaos simulation passed.');
