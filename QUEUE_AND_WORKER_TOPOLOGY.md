# Queue And Worker Topology

No rewrite is introduced in Phase 8.

## Queue ownership

`lib/queue/orchestration.ts` remains the durable BullMQ orchestration owner. `lib/operations/scale-readiness.ts` defines the operational queue contracts.

Canonical queues:

- onboarding
- template-import
- analytics
- stock-recalculation
- report-generation
- observability-aggregation
- ai-task
- notification

Device queues remain owned by the local POS agent and device runtime:

- print
- kitchen-print
- fiscal-device

Runtime maintenance queues are operational contracts:

- reconciliation-cleanup
- runtime-cleanup
- recovery

## Worker ownership

`adisyum-worker` handles server-side orchestration queues and must not own interactive POS mutations.

The local POS agent handles print, sync, and fiscal device queues and must not own tenant provisioning or product mutation.

Runtime cleanup jobs handle stale snapshots and optimistic queue cleanup and must never run as UI render side effects.

## Hard rules

Every background operation must have deterministic ownership.

Every queue must have bounded retries.

Every queue must have dead-letter rules.

Every queue must expose observability.
