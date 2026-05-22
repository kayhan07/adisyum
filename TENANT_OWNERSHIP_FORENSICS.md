# Tenant Ownership Forensics

Phase 4 does not rewrite tenant architecture. No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Current Deterministic Ownership

The Prisma schema contains a strong tenant root:

- `Tenant.tenantId` is unique.
- `Branch` references `Tenant` by `tenantId`.
- Auth, POS, product, inventory, runtime, queue, device, and printer tables carry tenant ownership.
- Most business tables include a tenant-scoped index or uniqueness.

The Phase 4 validator enforces non-null `tenantId` on critical tenant-owned models such as:

- auth: `User`, `Role`, `Permission`, `Session`
- POS: `TableGroup`, `PosTable`, `Order`, `OrderItem`, `Payment`
- product: `ProductCategory`, `Product`, `ProductRevision`, `ProductVariant`
- inventory: `Warehouse`, `StockItem`, `StockMovement`, `Recipe`, `RecipeItem`
- runtime: `RuntimeState`, `SyncQueue`, `OfflineEvent`
- device: `DeviceHeartbeat`, `TenantDeviceRegistry`, `TenantPrintJob`

## Optional Tenant Scope

Some platform telemetry models intentionally support nullable tenant ownership:

- `OperationalEvent.tenantId`
- `AuditLog.tenantId`
- `OperationalIncident.tenantId`

These are not treated as business data authority. They are for platform-wide incidents, unauthenticated failures, or pre-tenant observability. This is nullable debt and must remain explicitly documented.

## Demo And System Ownership

Template models use `tenantId @default("system")` to separate system template catalogs from tenant-owned products:

- `RecipeTemplate`
- `CategoryTemplate`
- `StockTemplate`
- `ProductTemplate`
- `TemplatePack`

This is acceptable only for template catalogs. Runtime product, order, device, printer, and table state must not use system tenant fallback.

## Known Risks

- `prisma/seed.mjs` still contains a demo tenant default (`ABN-48291`) and demo statuses. This must stay isolated from production deploys.
- Tenant optional observability rows must never be joined into business workflows as authoritative tenant records.
- Any future migration that makes critical `tenantId` nullable must fail Phase 4 review.

## Gate

`npm run recomposition:phase4-validate` verifies tenant-scoped index coverage, non-null tenant ownership for critical models, and documented nullable tenant debt.

