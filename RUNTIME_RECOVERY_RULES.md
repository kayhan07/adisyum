# Runtime Recovery Rules

No rewrite is introduced in Phase 7.

## Centralized telemetry ownership

Runtime recovery is observable through `lib/observability/enterprise-telemetry.ts` and executable through existing recovery owners.

## Recovery owners

`lib/self-healing/engine.ts` owns process-level recovery signals: PM2 restart detection, memory leak mitigation, CPU runaway detection, zombie connection cleanup, websocket reconnect triggers, sync queue recovery, printer reconnect, and dead queue cleanup.

`lib/pos-runtime/runtime-persistence-engine.ts` owns stale or corrupted persistence invalidation.

`lib/pos-runtime/runtime-sync-engine.ts` owns websocket and authoritative sync recovery boundaries.

`lib/pos-runtime/order-mutations.ts` owns optimistic queue recovery, commit, and rollback lifecycle.

## Hard rules

Every runtime failure must become observable.

Every runtime crash must become recoverable.

Recovery must never mutate UI state directly.

Recovery must never create a second reconciliation owner.

Recovery must never hide the original failure. It records the failure, records the attempted recovery, and leaves escalation visible when unresolved.

## Runtime crash recovery

PM2 restart count changes are treated as production recovery evidence. Runtime-build-id must remain available after restart. If restart loops occur, deployment validation and system-admin observability must surface the drift.

## Client runtime recovery

Stale snapshots are rejected by the persistence engine. Hydration reentry is bounded by the sync engine. Optimistic queues are resolved by the mutation runtime. UI may only render the resulting runtime state.
