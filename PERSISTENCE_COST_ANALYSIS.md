# Persistence Cost Analysis

No rewrite is introduced in Phase 6.

## Rules

- Every persistence write must be deduplicated.
- Snapshot restore count must be observable.
- Snapshot write count must be observable.
- Oversized snapshots must be flagged.
- Persistence must not trigger recursive reconciliation.

## Current Hardening

- `persistRuntimeJson` compares serialized payload before writing.
- Redundant writes increment `runtimePersistenceSuppressedWriteCount`.
- Writes increment `runtimePersistenceWriteCount`.
- Restores increment `runtimePersistenceRestoreCount`.
- Snapshot size is checked against `MAX_RUNTIME_SNAPSHOT_BYTES`.

## Stability Target

Persistence replay storms and repeated same-payload writes should be visible and suppressed before they become render or memory pressure.

