# Reseller Operational Governance

No rewrite is introduced in Phase 10.

## Topology

Reseller governance owns reseller identity, tenant assignment, revenue sharing, commission ownership, tenant provisioning linkage, reseller health, and reseller operational visibility.

## Assignment rule

Reseller assignment must have one active owner per tenant period.

## Commission rule

Commission is generated once per paid sale event and must reference a tenant-scoped invoice or payment idempotency key.

## Audit

Every billing event must be tenant-scoped and idempotent.

AI may recommend revenue action but must not alter billing state.
