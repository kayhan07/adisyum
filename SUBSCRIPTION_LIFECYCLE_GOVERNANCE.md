# Subscription Lifecycle Governance

No rewrite is introduced in Phase 10.

## Governed states

Subscription lifecycle states are trial, active, grace period, suspended, expired, canceled, and reactivation pending.

## Ownership

Commercial operations owns activation, cancellation, and reactivation decisions.

Billing governance owns grace period, expiration, and suspension enforcement.

Tenant runtime context enforces runtime impact only after billing governance resolves the state.

## Rules

Every billing event must be tenant-scoped and idempotent.

Credit deduction must be deterministic and negative-balance protected.

AI may recommend revenue action but must not alter billing state.

Lifecycle transitions must be audited and must not skip governed states.
