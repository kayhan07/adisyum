# Quota And Limit Enforcement

No rewrite is introduced in Phase 10.

## Quotas

Governed quotas include branch limit, user limit, printer limit, API limit, AI limit, storage limit, and worker limit.

## Enforcement

Quota enforcement can warn, switch to read-only, or block new work. It must never mutate historical business data.

## Runtime safety

Existing operational data remains readable during suspension or quota enforcement. New work may be blocked only by the canonical owner.

## Rules

Credit deduction must be deterministic and negative-balance protected.

Every billing event must be tenant-scoped and idempotent.

AI may recommend revenue action but must not alter billing state.
