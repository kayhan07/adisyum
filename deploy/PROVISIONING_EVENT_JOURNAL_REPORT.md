# Provisioning Event Journal

## Architecture

`ProvisioningJob` remains the durable state machine for onboarding progress. `ProvisioningJobEvent` adds an append-only observability journal for support and operations without becoming part of the tenant graph transaction.

The provisioning transaction now collects step traces in memory while it creates the tenant graph. Only after the transaction commits successfully are those traces persisted as journal events. Failed transactions therefore remain atomic, while the job still receives a separate `provisioning_failed` event with the failure reason.

## Event Surface

- `tenant_created`
- `branch_created`
- `main_branch_assigned`
- `subscription_created`
- `roles_created`
- `admin_created`
- `idempotent_retry_hit`
- `retry_started`
- `retry_completed`
- `provisioning_completed`
- `provisioning_failed`
- `rollback_started`
- `rollback_completed`

Each event stores severity, source, optional duration, and JSON metadata for later AI diagnostics or support export.

## Operational UX

System-admin exposes:

- provisioning success, retry, rollback, and duration metrics
- per-job event timeline
- event metadata inspection
- retry and rollback actions
- JSON export for support handoff

## Hardening Notes

- Journal writes are append-only and tenant graph writes remain transactional.
- Retry events are explicit, so support can distinguish a first success from a recovered success.
- Metrics derive from durable jobs and events rather than client-local state.
- Event metadata is intentionally structured to support future anomaly detection and onboarding recommendations.
