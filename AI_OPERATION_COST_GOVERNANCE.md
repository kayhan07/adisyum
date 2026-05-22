# AI Operation Cost Governance

No rewrite is introduced in Phase 10.

## Scope

AI operation cost governance tracks unhealthy tenant economics, excessive runtime cost, low-margin tenant behavior, anomalous consumption, websocket cost anomalies, worker cost anomalies, and AI operation cost spikes.

## Boundary

AI may recommend revenue action but must not alter billing state.

AI must not deduct credits, suspend tenants, change plans, alter reseller assignment, or execute payment recovery.

## Rules

Every billing event must be tenant-scoped and idempotent.

Every usage metric must have owner, billing strategy, aggregation, retention, and observability.

Credit deduction must be deterministic and negative-balance protected.
