# Telemetry Aggregation Topology

No rewrite is introduced in Phase 9.

## Sources

AI operations aggregates runtime metrics, websocket metrics, queue metrics, reconciliation metrics, deploy metrics, tenant health metrics, and mutation lifecycle metrics.

## Owners

Enterprise telemetry owns cross-domain health snapshots.

The anomaly detector owns anomaly event and baseline logic.

Self-healing owns recovery event telemetry.

Scale readiness owns queue, worker, cache, tenant operation, and realtime scale contracts.

AI operations owns recommendations and scoring only.

## Hard rules

Centralized AI governance.

AI must remain bounded, observable, auditable, and deterministic.

AI MUST NEVER mutate production business data.

AI MUST NEVER deploy automatically.

Safe auto-recovery is limited to runtime cleanup and bounded orchestration.
