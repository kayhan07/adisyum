# Enterprise Incident And Audit Intelligence

## Durable Backbone

Adisyum now separates realtime telemetry from durable operational traceability:

- `AuditLog` is the append-only mutation ledger.
- `OperationalIncident` is the durable incident root record.
- `OperationalIncidentEvent` is the incident timeline.
- `OperatorMemory` persists operator favorites and future saved views.

Audit rows now carry correlation fields such as `correlationId`, `mutationId`, `orchestrationJobId`, `queueJobId`, `deviceId`, `route`, and `source`.

## Incident Lifecycle

Critical and error-level operational events automatically open or update durable incidents. Each incident stores:

- affected tenant/branch
- severity and status
- blast radius
- root correlation id
- operator acknowledgement and resolution state
- append-only timeline events

## Operator Workflows

System-admin now has:

- **Incident Center** for active incident triage and timelines
- **Audit Explorer** for fuzzy mutation tracing and before/after inspection
- persisted favorite tenants through operator memory

## Correlation Model

The durable correlation model is designed around a single trace spine:

1. request or mutation produces `correlationId`
2. `AuditLog` records who changed what
3. `OperationalEvent` captures realtime side effects
4. `OperationalIncidentEvent` captures the incident narrative

This keeps realtime streams fast while preserving a reconstructable support history.

## Scale Safety

- Incident rows stay compact and timeline events remain append-only.
- Audit explorer uses filtered queries with bounded result sizes.
- Incident duplication is suppressed by stable `incidentKey`.
- Operator memory is normalized rather than stored in browser-only state.

## Next Deepening Steps

1. Propagate `correlationId` through every write path and queue worker.
2. Move legacy in-memory observability tabs fully onto durable tables.
3. Add export jobs for audit bundles and incident postmortems.
4. Add correlation graph materialization for very large traces.
