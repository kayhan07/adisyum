# Runtime Performance Forensics

Phase 6 hardens runtime behavior under load. No rewrite is introduced in Phase 6.

## Runtime Rules

- Render phase must remain pure.
- Every subscription must have deterministic cleanup.
- Every interval must have deterministic ownership.
- Every persistence write must be deduplicated.
- Every runtime event must be bounded.
- Every hydration cycle must be bounded.
- Every optimistic mutation must resolve or rollback deterministically.

## Instrumented Owners

- Event bus: listener count, emission count, duplicate suppression count, payload soft limit.
- Runtime sync engine: hydration count, sync cycle count, active subscription count, in-flight suppression count.
- Persistence engine: write count, suppressed write count, restore count, snapshot byte soft limit.
- Order mutations runtime: created, dispatched, committed, rolled back, pending mutation age.

## Render Risk Boundaries

UI must render runtime state and emit intent only. Runtime mutation generation, reconciliation, persistence, and sync ownership remain outside render-phase component execution.

## Load Scenarios To Keep Testing

- rapid product insertion;
- rapid table switching;
- focus/blur storms;
- stale authoritative payload replay;
- multi-tab runtime usage;
- long cashier sessions.

