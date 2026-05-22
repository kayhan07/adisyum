# Self Healing Governance

No rewrite is introduced in Phase 9.

## Ownership

Self-healing remains owned by `lib/self-healing/engine.ts`. AI operations consumes self-healing signals and produces recommendations; it does not replace the recovery owner.

## Safe actions

Safe auto-recovery is limited to runtime cleanup and bounded orchestration.

Allowed actions include stale runtime cleanup, stale snapshot invalidation, websocket reconnect throttling, orphan subscription cleanup, stale optimistic queue cleanup, runtime cache invalidation, and bounded retry orchestration.

## Forbidden actions

AI MUST NEVER mutate production business data.

AI MUST NEVER deploy automatically.

AI must not perform destructive migrations, delete tenant records, alter billing state, alter reconciliation ownership, or bypass tenant isolation.

## Rule

AI must remain bounded, observable, auditable, and deterministic.
