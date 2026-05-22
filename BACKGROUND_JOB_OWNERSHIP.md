# Background Job Ownership

No rewrite is introduced in Phase 8.

## Canonical rule

Every background operation must have deterministic ownership.

Background jobs must not run as render side effects and must not become alternate runtime owners.

## Job classes

Receipt and kitchen printing belong to device runtime and local bridge queues.

Stock recalculation belongs to product domain queues and must not block POS insertion.

Notification delivery belongs to system-admin operational queues.

Reconciliation cleanup belongs to POS runtime maintenance queues.

Telemetry aggregation belongs to observability queues.

Runtime cleanup belongs to POS runtime maintenance queues.

Recovery jobs belong to deployment and self-healing ownership.

## Queue policy

Every queue must have bounded retries.

Dead-letter jobs must remain observable and operator-clearable where business impact exists.

Retry attempts must be finite and backoff-based.
