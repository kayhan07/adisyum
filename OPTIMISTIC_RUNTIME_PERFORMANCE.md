# Optimistic Runtime Performance

No rewrite is introduced in Phase 6.

## Ownership

Order mutations runtime owns:

- mutation id creation;
- optimistic line creation;
- mutation dispatch;
- commit/rollback lifecycle;
- mutation diagnostics.

## Counters

- `runtimeMutationCreatedCount`
- `runtimeMutationDispatchedCount`
- `runtimeMutationCommittedCount`
- `runtimeMutationRolledBackCount`
- `MAX_PENDING_MUTATION_AGE_MS`

## Rules

- Every optimistic mutation must resolve or rollback deterministically.
- Pending optimistic state must be protected during authoritative sync.
- Duplicate mutation ownership must not return to UI.
- Pending mutation age must be observable.

## Stability Target

High-frequency product insertion should not create unresolved mutation buildup or repeated rollback drift.

