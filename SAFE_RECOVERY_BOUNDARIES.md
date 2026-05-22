# Safe Recovery Boundaries

No rewrite is introduced in Phase 9.

## Allowed recovery

Safe auto-recovery is limited to runtime cleanup and bounded orchestration.

Allowed:

- stale runtime cleanup
- stale snapshot invalidation
- websocket reconnect throttling
- orphan subscription cleanup
- stale optimistic queue cleanup
- runtime cache invalidation
- bounded retry orchestration

## Forbidden recovery

AI MUST NEVER mutate production business data.

AI MUST NEVER deploy automatically.

Forbidden:

- destructive migrations
- tenant record deletion
- billing state changes
- reconciliation ownership changes
- tenant isolation bypass
- automatic deployment

## Governance

AI must remain bounded, observable, auditable, and deterministic.
