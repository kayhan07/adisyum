# Operational Intelligence Architecture

## Scope

Operational intelligence extends Adisyum beyond onboarding into live restaurant diagnostics.

## DB-backed Health Engine

The operational engine evaluates tenant-owned data only:

- products
- recipes
- recipe items
- stock items
- printers
- orders
- payments
- stock movements
- template imports

It never crosses tenant boundaries and never reads system templates as live tenant state.

## Scores

- health score
- operational score
- stock accuracy score
- onboarding completeness score
- sync health score
- printer health score

## Automatic Problem Detection

Implemented detectors:

- products without recipes
- recipe items without stock cards
- critical stock levels
- stale categories
- inactive/misconfigured printers
- duplicate products
- suspicious negative stock movements
- sync failures
- degraded websocket health

## Business Intelligence

Current BI outputs:

- most sold products
- peak hours
- category revenue ranking
- open order count
- daily revenue

These are tenant-scoped aggregates and are suitable future inputs for AI forecasting, menu engineering, and pricing recommendations.

## API Surface

Tenant:

- `GET /api/operational-intelligence`

System-admin:

- `GET /api/system-admin/operational-intelligence`
- operational intelligence included in `/api/system-admin/observability`

## UI Surface

Tenant:

- `/operations`

System-admin:

- monitoring overview shows weakest operational tenants and alert counts

## Scaling and Safety

- all queries are tenant scoped
- system-admin aggregation evaluates tenants independently
- current synchronous implementation is appropriate for small/medium tenant counts
- next scale step is scheduled materialization/background jobs for large fleets

## AI-ready Follow-ups

- stock forecasting
- margin calculations from recipe costs
- waste reduction scoring
- staffing suggestions
- campaign suggestions
- predictive churn / onboarding risk
