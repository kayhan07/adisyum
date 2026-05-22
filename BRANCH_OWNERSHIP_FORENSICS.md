# Branch Ownership Forensics

No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Canonical Branch Identity

Canonical branch ownership is:

`Branch.(tenantId, branchId)`

Any branch-aware table must satisfy:

- it carries `tenantId`;
- it carries `branchId`;
- it has an index or uniqueness beginning with `[tenantId, branchId]`;
- it does not resolve branch ownership from localhost, demo data, or UI-only state.

## Branch-Aware Tables

Current branch-aware tables include:

- `Branch`
- `User`
- `Session`
- `PresenceSession`
- `DeviceHeartbeat`
- `TenantDeviceRegistry`
- `TenantPrintJob`
- `OperationalEvent`
- `AuditLog`
- `OperationalIncident`

The validator verifies that branch-aware tables also carry `tenantId` and warns when a `[tenantId, branchId]` index is missing.

## Branch Topology Debt

The following operational tables are tenant-owned but do not yet physically carry `branchId`:

- `Order`
- `PosTable`
- `Warehouse`
- `Printer`
- `CashRegister`

This is not patched blindly in Phase 4 because adding branch columns to live data requires a migration impact report, backfill strategy, rollback plan, and tenant-by-tenant validation.

## Safe Next Migration Strategy

Before introducing physical branch ownership to any debt table:

- generate row counts grouped by tenant;
- define branch derivation source for existing records;
- backfill with deterministic tenant main branch only when validated;
- add nullable column first if required for data compatibility;
- backfill;
- add indexes;
- only then consider non-null constraints.

## Gate

`npm run recomposition:phase4-validate` records branch ownership drift as warnings unless it violates the hard rule that `branchId` cannot exist without `tenantId`.

