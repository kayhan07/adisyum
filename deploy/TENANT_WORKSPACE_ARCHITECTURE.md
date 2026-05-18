# Tenant Workspace Architecture

## Why The Split Exists

System-admin has outgrown a single dashboard surface. The tenant experience now separates:

- **Tenants Home** for fast portfolio-level scanning
- **Tenant Workspace** routes for tenant-specific operations

## Routing

Each tenant receives an isolated route:

`/system-admin/tenants/:tenantId`

The workspace is intentionally route-level so future sections can lazy-load independently and avoid hydrating every tenant domain into one giant client tree.

## Layout

The workspace uses a three-panel model:

1. left navigation for tenant domains
2. center surface for one active operational context
3. right live sidebar for persistent realtime signals

## Current Segmented Sources

- tenant summary from `/api/system-admin/tenants`
- realtime context from `/api/system-admin/live-operations`
- incidents from `/api/system-admin/incidents?tenantId=...`
- audit from `/api/system-admin/audit?tenantId=...`

## Design Principles

- one operational context at a time
- contextual KPIs instead of universal KPI overload
- tenant route ownership over modal accumulation
- lightweight recurring live refreshes
- progressive disclosure for heavier tenant tools

## Next Deepening Steps

1. Add dedicated tenant detail APIs for finance, branches, printers, queues, and security.
2. Persist recent investigations and custom workspace layouts through `OperatorMemory`.
3. Add virtualization for dense incident/audit timelines.
4. Add incident deep-links directly into contextual workspace surfaces.
