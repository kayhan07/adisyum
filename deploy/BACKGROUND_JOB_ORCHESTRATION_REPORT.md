# Background Job Orchestration

## Durable queue architecture

Adisyum now uses BullMQ-backed Redis queues for heavy operational work. HTTP routes are orchestration triggers; the worker process owns execution.

Queues:

- `onboarding`
- `template-import`
- `analytics`
- `stock-recalculation`
- `report-generation`
- `observability-aggregation`
- `ai-task`
- `notification`

## Runtime topology

- `adisyum-website`: public website runtime
- `adisyum-root-app`: business/API runtime
- `adisyum-worker`: BullMQ orchestration worker

Production now requires `REDIS_URL` in addition to the existing REST Redis variables. The REST variables still serve cache/health probes; `REDIS_URL` is the durable worker transport.

## Async onboarding

Tenant provisioning now follows:

1. System-admin request creates `ProvisioningJob`.
2. API schedules a BullMQ onboarding job and returns `202 Accepted`.
3. Worker runs provisioning or rollback out of band.
4. `ProvisioningJobEvent` timeline records queued, retry, completion, rollback, and failure events.
5. Jobs Center and tenant timeline refresh from durable queue/job state.

## Recovery model

- BullMQ retries use exponential backoff.
- Failed jobs remain queryable as dead-letter candidates after attempts are exhausted.
- Jobs Center exposes retry and failed-job cleanup actions.
- Provisioning graph mutation remains transactional and idempotent.

## Multi-tenant safety

- Job payloads carry explicit `tenantId` and provisioning job IDs.
- Queue execution never trusts browser state.
- Tenant graph creation still happens only through server-side provisioning services.
- Worker queues are system-admin orchestration surfaces, not tenant-facing endpoints.

## AI-ready foundation

The dedicated `ai-task` queue reserves a durable execution lane for future onboarding recommendations, forecasting, and diagnostics without coupling AI latency to request-response flows.
