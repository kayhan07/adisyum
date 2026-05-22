# Production Health Topology

No rewrite is introduced in Phase 7.

## Canonical runtime health graph

`adisyum-root-app` on port `3000` owns `/api`, `/app`, `/system-admin`, POS, ERP, runtime engines, tenant runtime, and system-admin runtime health.

`adisyum-website` on port `3010` owns the marketing website only.

`adisyum-worker` owns background processing only.

## Health endpoints

`/api/runtime-build-id` proves live runtime identity, active commit, deployment time, PM2 process identity, PM2 restart count, session cookie domain, and canonical runtime authority.

`/api/system-admin/observability` provides authenticated operational health, including `enterpriseTelemetry`.

## Health dimensions

Runtime health includes uptime, memory pressure, restart count, unresolved healing events, websocket health, persistence pressure, and reconciliation pressure.

API health includes latency, failure rate, mutation failure rate, auth failure rate, tenant resolution failures, and rollback frequency.

Database health includes slow query records, connection pool pressure, deadlocks, Prisma errors, transaction failures, and tenant isolation warnings.

Deployment health includes runtime-build-id consistency, PM2 ownership, nginx ownership, route registration, and stale runtime detection.

Client runtime health includes render storms, hydration storms, websocket reconnect storms, stale snapshot floods, persistence floods, and event bus flooding.

## Hard rules

Centralized telemetry ownership.

Every runtime failure must become observable.

Every deploy must become verifiable.

Every runtime crash must become recoverable.
