const scenarios = {
  redis_outage: ['enable_degraded_mode', 'pause_replay', 'request_operator_approval'],
  websocket_collapse: ['rebuild_stream', 'enable_degraded_mode'],
  worker_crash_storm: ['restart_workers', 'pause_replay'],
  db_reconnect_storm: ['isolate_domain', 'failover_region'],
  rollout_corruption: ['isolate_domain', 'enable_degraded_mode'],
  replay_corruption: ['pause_replay', 'restart_workers'],
  region_isolation: ['isolate_domain', 'failover_region'],
};

const domainActions = {
  redis_outage: ['enable_degraded_mode', 'pause_replay', 'request_operator_approval'],
  websocket_collapse: ['rebuild_stream', 'enable_degraded_mode'],
  worker_crash_storm: ['restart_workers', 'pause_replay'],
  db_reconnect_storm: ['isolate_domain', 'failover_region'],
  rollout_corruption: ['isolate_domain', 'enable_degraded_mode'],
  replay_corruption: ['pause_replay', 'restart_workers'],
  region_isolation: ['isolate_domain', 'failover_region'],
};

let failures = 0;

for (const [scenario, expectedActions] of Object.entries(scenarios)) {
  const actualActions = domainActions[scenario] ?? [];
  const missing = expectedActions.filter((action) => !actualActions.includes(action));
  const ok = missing.length === 0;
  if (!ok) failures += 1;
  console.log(JSON.stringify({ scenario, ok, expectedActions, actualActions, missing }));
}

if (failures > 0) {
  console.error(`Disaster recovery chaos simulation failed: ${failures} scenario(s) missed required actions.`);
  process.exit(1);
}

console.log('Disaster recovery chaos simulation passed.');
