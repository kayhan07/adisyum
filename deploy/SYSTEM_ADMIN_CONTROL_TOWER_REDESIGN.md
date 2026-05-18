# System Admin Control Tower Redesign

## Information Architecture

The system-admin experience now groups work into three operator domains:

- Control
  - Command Center
  - Tenants
  - Finance
- Operations
  - Operations
  - Observability
  - Jobs
  - Devices
  - Security
- Growth
  - Templates
  - Analytics
  - AI Insights
  - Billing
  - Resellers

## Experience Model

- Sticky command bar surfaces the metrics that operators need before opening a module.
- Command Center acts as the live landing page rather than a CRUD dashboard.
- Tenant management is card-first, searchable, and visually risk-aware.
- Finance Center consolidates sales, payments, invoices, and cash movement.
- Operations, Devices, Security, and AI Insights expose domain-specific views without flattening the whole product into one table wall.

## Realtime Inputs

The redesign consumes existing durable telemetry:

- live operations summary
- provisioning metrics
- operational event stream
- tenant summary
- finance state

The UI does not create a new source of truth; it reorganizes existing server-backed operations signals.

## Performance Notes

- Top-level live command metrics refresh on a moderate cadence.
- Dense modules remain demand-loaded by navigation state.
- Existing SSE modules continue to own their own streams rather than duplicating them globally.
- Tenant cards use compact derived values to avoid large nested payload rendering.

## Next UX Steps

1. Replace provisional onboarding controls with a fully persisted multi-step wizard state.
2. Add tenant drawer tabs backed by tenant-detail endpoints.
3. Add saved views, pinned tenants, and fuzzy keyboard command search.
4. Back AI Insights with actual scoring services once the predictive layer is introduced.
