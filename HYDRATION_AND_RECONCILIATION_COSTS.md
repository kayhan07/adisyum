# Hydration And Reconciliation Costs

No rewrite is introduced in Phase 6.

## Hydration Rules

- Hydration must be bounded.
- Hydration must not run from render phase.
- Authoritative payloads must pass optimistic protection.
- Reconciliation must remain owned by the table state engine and runtime sync engine.

## Cost Counters

- `runtimeHydrationCount`
- `runtimeSyncCycleCount`
- `runtimeSyncInFlightSuppressionCount`
- `activeRuntimeSubscriptionCount`

## Reconciliation Ownership

`reconcileTableState` remains canonical. The validator rejects direct reconciliation ownership outside:

- `lib/runtime/table-state-engine.ts`
- `lib/pos-runtime/runtime-sync-engine.ts`

## Stability Goal

Focus sync, interval sync, and initial hydration must not create stale snapshot storms or overwrite active optimistic mutations.

