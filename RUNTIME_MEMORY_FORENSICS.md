# Runtime Memory Forensics

No rewrite is introduced in Phase 6.

## Memory Risk Areas

- retained runtime event listeners;
- unbounded event payloads;
- oversized persisted snapshots;
- stale optimistic mutation references;
- repeated hydration closures;
- orphan intervals.

## Hardening Added

- Event bus exposes listener count and payload soft limit.
- Persistence engine exposes snapshot byte soft limit.
- Runtime sync cleanup decrements active subscription count.
- Mutation diagnostics expose pending mutation age and stale marker.

## Required Practice

Every subscription must have deterministic cleanup. Every runtime event must be bounded. Every persistence write must be deduplicated.

## Follow-Up Load Test Targets

- multi-hour POS session;
- large active orders;
- multi-tab open/close churn;
- reconnect storms;
- offline replay preparation.

