# Runtime Telemetry Contracts

No rewrite is introduced in Phase 7.

## Centralized telemetry ownership

`lib/observability/enterprise-telemetry.ts` defines the Phase 7 telemetry contract.

## Contract functions

`recordEnterpriseTelemetry` records bounded enterprise events and mirrors them into structured logs.

`buildRuntimeTelemetrySnapshot` reports server runtime health, memory pressure, PM2 identity, PM2 restart count, unresolved healing work, recent error logs, and slow query pressure.

`buildDeploymentTelemetrySnapshot` reports canonical runtime authority, active commit, deployment time, PM2 ownership, nginx ownership, and drift checks.

`buildClientRuntimeTelemetrySnapshot` reports the canonical diagnostics owners for event bus, persistence, sync, and mutation runtime.

`getEnterpriseRecoveryContracts` describes recovery ownership without executing recovery from the observability layer.

`buildEnterpriseTelemetrySnapshot` composes the system-admin enterprise health payload.

## Hard rules

Every runtime failure must become observable.

Every deploy must become verifiable.

Every runtime crash must become recoverable.

Telemetry must not emit recursively during render.

Telemetry must not become a second mutation, reconciliation, persistence, or websocket owner.
