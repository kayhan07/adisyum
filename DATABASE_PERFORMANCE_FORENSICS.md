# Database Performance Forensics

No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Tenant-Scoped Index Rule

Every tenant-owned operational table needs a tenant-scoped index. High-traffic tables should prefer composite indexes beginning with `tenantId`.

Confirmed important patterns:

- auth: `[tenantId, userId]`, `[tenantId, branchId]`, `[tenantId, expiresAt]`
- product: `[tenantId, productType, active]`, `[tenantId, lifecycleStatus]`, `[tenantId, publishStatus]`
- POS orders: `[tenantId, status]`, `[tenantId, createdAt]`, unique `[tenantId, orderNo]`
- runtime snapshots: unique `[tenantId, key]`
- offline replay: unique `[tenantId, eventId]`
- devices: unique `[tenantId, deviceId]`
- print queue: `[tenantId, status, createdAt]`, `[tenantId, targetDeviceId, status]`

## Current Performance Debt

- `Order` does not yet have a branch index because it does not physically carry `branchId`.
- `PosTable` does not yet have a branch index because it does not physically carry `branchId`.
- `Printer`, `Warehouse`, and `CashRegister` are tenant-indexed but not branch-indexed.
- JSON payload tables (`RuntimeState`, `SyncQueue`, `OfflineEvent`) need operational payload size monitoring before scale hardening.

## Query Safety Rules

- Business queries must include `tenantId`.
- Branch-aware business queries should include `(tenantId, branchId)` when the physical field exists.
- Runtime snapshot queries must use `(tenantId, key)`.
- Product runtime queries must prefer `tenantId` plus `posKey`, lifecycle, publish, or type filters.

## Gate

The Phase 4 validator verifies tenant-scoped index coverage and warns about missing branch composite indexes.

