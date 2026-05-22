# Billing Observability Architecture

No rewrite is introduced in Phase 10.

## Dashboard scope

System-admin observability exposes `monetizationGovernance` with subscription governance, credit rules, usage metering, reseller topology, quota governance, billing safety, and revenue intelligence readiness.

## Health dimensions

Dashboards must show tenant revenue health, subscription health, reseller revenue, quota utilization, operational cost, runtime cost, AI operation cost, infrastructure cost, and billing failures.

## Rules

Every billing event must be tenant-scoped and idempotent.

Every usage metric must have owner, billing strategy, aggregation, retention, and observability.

AI may recommend revenue action but must not alter billing state.
