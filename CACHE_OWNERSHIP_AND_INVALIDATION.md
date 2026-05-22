# Cache Ownership And Invalidation

No rewrite is introduced in Phase 8.

## Cache segmentation

Runtime catalog cache is segmented by tenant and branch. Invalidation follows catalog revision changes.

Runtime table snapshot cache is segmented by runtime scope. Invalidation follows order revision or stale snapshot rejection.

Tenant session cache is segmented by tenant. Invalidation follows session revocation or tenant suspension.

Observability cache is segmented by tenant. Invalidation follows retention windows and aggregation runs.

Deployment artifact cache is segmented by deployment. Invalidation follows runtime-build-id mismatch or fresh deploy.

## Hard rules

Every background operation must have deterministic ownership.

Every tenant operation must be auditable.

Cache keys must never rely on localhost, demo tenant fallback, or pathname-derived ownership.

No cache may merge tenant rows without tenant identity.
