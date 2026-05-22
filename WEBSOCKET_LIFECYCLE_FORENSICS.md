# WebSocket Lifecycle Forensics

No rewrite is introduced in Phase 6.

## Ownership

Runtime synchronization owns authoritative sync subscriptions. UI must not directly process websocket payloads or decide reconciliation.

## Rules

- Every subscription must have deterministic cleanup.
- Listener count must be observable.
- Reconnect/focus/interval sync must not overlap reconciliation.
- Stale payloads must be rejected before they overwrite optimistic state.

## Current Hardening

- `runtime-sync-engine` guards overlapping reconciliation with `reconcileInFlight`.
- Cleanup clears interval and removes focus listener.
- Active subscription count is decremented on cleanup.
- In-flight suppression is counted as `runtimeSyncInFlightSuppressionCount`.

## Remaining Audit

Feature-level realtime modules remain compatibility-owned and should be audited before moving any more websocket behavior into UI.

