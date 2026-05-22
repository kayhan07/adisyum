# Nullable Debt Report

No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Safe Nullable Fields

Safe nullable fields are descriptive, lifecycle, or optional integration metadata:

- `deletedAt`, `archivedAt`, `deprecatedAt`
- `imageUrl`, `thumbnailUrl`, media dimensions
- optional contact fields such as phone/email
- optional diagnostics fields such as `lastError`

## Dangerous Nullable Ownership

Dangerous nullable fields are ownership fields that may be valid for compatibility but need explicit governance:

- `OperationalEvent.tenantId`
- `AuditLog.tenantId`
- `OperationalIncident.tenantId`
- `Session.branchId`
- `PresenceSession.branchId`
- `TenantDeviceRegistry.branchId`
- `TenantPrintJob.branchId`
- `DeviceHeartbeat.branchId`
- `Product.categoryId`
- `Product.posKey`
- `Order.tableId`
- `OrderItem.productId`
- `Payment.orderId`
- `StockMovement.stockItemId`
- `StockMovement.warehouseId`
- `Printer.groupId`
- `Recipe.productId`
- `RecipeItem.stockItemId`

## Migration-Required Nullable Debt

These should not be tightened without a data migration plan:

- Physical `branchId` absence on `Order`, `PosTable`, `Warehouse`, `Printer`, and `CashRegister`.
- Nullable `Product.posKey`, because POS runtime expects stable product identity.
- Nullable `OrderItem.productId`, because historical/manual order lines may exist but runtime catalog integrity prefers immutable product snapshots.

## Required Hardening Process

Before tightening any nullable ownership field:

- run read-only production counts grouped by tenant;
- classify null rows by origin;
- define deterministic backfill;
- validate tenant isolation;
- add indexes first;
- add non-null constraints only after clean production data proof.

## Gate

`npm run recomposition:phase4-validate` reports nullable ownership fields and fails only when critical tenant ownership itself becomes nullable.

