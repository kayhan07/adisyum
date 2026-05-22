# Anomaly Detection Forensics

No rewrite is introduced in Phase 9.

## Existing engine

`lib/anomaly/detector.ts` owns deterministic anomaly detection using rolling baselines and deviation analysis.

## AI consumption

The AI operations layer consumes anomaly stats and recent anomaly events. It does not mutate anomaly baselines directly.

## Detected patterns

- websocket reconnect storms
- sync and reconciliation failures
- tenant traffic spikes
- printer failures
- login anomalies
- revenue drops
- cancel or refund spikes

## Governance

Centralized AI governance requires anomaly output to remain auditable and tenant-scoped.

AI must remain bounded, observable, auditable, and deterministic.

Safe auto-recovery is limited to runtime cleanup and bounded orchestration.
