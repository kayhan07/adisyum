# Enterprise Observability Architecture

Phase 7 establishes centralized production observability without changing the POS, ERP, tenant, or runtime ownership architecture.

No rewrite is introduced in Phase 7.

## Centralized telemetry ownership

`lib/observability/enterprise-telemetry.ts` is the canonical enterprise telemetry layer. It is the only Phase 7 boundary that defines cross-domain observability contracts for runtime health, deployment health, client runtime health, and recovery contracts.

Existing operational stores remain in place:

- `lib/observability/metrics-store.ts` owns structured logs, request metrics, release telemetry, tenant observability rows, server metric snapshots, and slow query records.
- `lib/self-healing/engine.ts` owns self-healing events and recovery statistics.
- `app/api/system-admin/observability/route.ts` owns authenticated system-admin delivery of observability payloads.
- `app/api/runtime-build-id/route.ts` owns live runtime identity proof.

## Hard rules

Every runtime failure must become observable.

Every deploy must become verifiable.

Every runtime crash must become recoverable.

Centralized telemetry ownership prevents random runtime modules from inventing new diagnostic authorities.

## Health dimensions

Runtime health tracks uptime, PM2 restart ownership, memory pressure, unresolved healing events, recent error logs, and slow query pressure.

API health remains captured through request metrics, route status, auth failures, mutation failures, and tenant failure records.

Database health remains captured through slow queries, PostgreSQL health probes, connection pressure, and Prisma error telemetry.

Deployment health is tied to `/api/runtime-build-id`, PM2 ownership, nginx upstream ownership, active git commit, deployment time, and canonical port ownership.

Client runtime health is represented by the Phase 2-6 diagnostics owners: event bus, persistence engine, sync engine, and order mutations runtime.

## Dashboard ownership

The system-admin observability endpoint now includes `enterpriseTelemetry`. That payload provides the top-level enterprise health contract while preserving all existing dashboard sections.

The dashboard must show health state; it must not become a second runtime owner.
