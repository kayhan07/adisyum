# Runtime Recursion Forensics

Phase 2 focuses on preventing runtime cycles without rewriting the working POS flow.

## Known Cycle Risks

| Cycle | Current guard | Owner |
| --- | --- | --- |
| focus or interval sync overlaps another sync | `reconcileInFlight` | `runtime-sync-engine` |
| stale authoritative payload overwrites optimistic line | `protectPendingOptimisticMutation` | `runtime-sync-engine` |
| redundant persistence write causes runtime-state broadcast loop | serialized equality checks | `runtime-persistence-engine`, `runtime-state` |
| cross-tab stale snapshot overwrites local mutation | local write grace window and table snapshot version checks | `runtime-state` |
| duplicate diagnostics flood console/subscribers | fingerprint suppression | `runtime-event-bus` |
| API URL changes based on `/adisyonsistemi` path | root-relative API builder | `runtime-api` |

## Forensic Counters

Runtime counters already present:

| Counter | File | Purpose |
| --- | --- | --- |
| `runtimeHydrationCount` | `runtime-sync-engine.ts` | detect repeated hydration |
| `runtimeSyncCycleCount` | `runtime-sync-engine.ts` | detect repeated sync cycles |
| `runtimeSubscriptionCount` | `runtime-sync-engine.ts` | detect duplicate sync subscriptions |
| `runtimeEventEmissionCount` | `runtime-event-bus.ts` | detect event floods |

## Hard Rules

Render must stay pure. Runtime mutation, persistence, hydration, and event emission must happen from explicit user handlers or effects.

UI components must not call `emitRuntimeEvent` directly. Components use `createRuntimeDiagnostics` or runtime engine return values.

POS API requests must not be built from `window.location.pathname`, `/app`, or `/adisyonsistemi`. All POS table-order calls must pass through `runtime-api`.

## Isolation Procedure

When a render storm, stale snapshot storm, or disappearing order line appears:

1. Confirm `runtimeEventEmissionCount` and sync counters.
2. Check whether `startAuthoritativeRuntimeSync` has more than one active subscription.
3. Check whether `orderMutationGuardRef` is active during stale authoritative payload acceptance.
4. Check whether `runtime-state` skipped or accepted a stale table snapshot.
5. Check whether UI called persistence directly instead of the persistence engine.
