# Database Topology V2

Phase 4 is a controlled database and tenant integrity cleanup. No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Canonical Ownership Graph

- Tenant root: `Tenant.tenantId`
- Branch scope: `Branch.(tenantId, branchId)`
- Auth scope: `User`, `Role`, `Permission`, `Session`, `PresenceSession`
- Product scope: `ProductCategory`, `Product`, `ProductRevision`, `ProductVariant`, `MediaAsset`
- POS scope: `TableGroup`, `PosTable`, `Order`, `OrderItem`, `Payment`
- Inventory scope: `Warehouse`, `StockItem`, `StockMovement`, `Recipe`, `RecipeItem`
- Device scope: `DeviceHeartbeat`, `TenantDeviceRegistry`, `TenantPrintJob`, `Printer`, `PrinterGroup`
- Runtime scope: `RuntimeState`, `SyncQueue`, `OfflineEvent`
- Observability scope: `OperationalEvent`, `AuditLog`, `OperationalIncident`, `OperationalIncidentEvent`
- Provisioning scope: `ProvisioningJob`, `ProvisioningJobEvent`, `TemplatePackImport`, `TemplateImport`

## Tenant Graph

Every tenant business entity must either:

- carry non-null `tenantId`;
- carry an explicit global/system ownership marker, such as template models using `tenantId @default("system")`;
- or be documented as optional platform telemetry with nullable tenant scope.

Critical tenant-owned models currently carry tenant-scoped index or uniqueness. The Phase 4 validator enforces this for POS, product, auth, device, runtime, inventory, and queue models.

## Branch Graph

Branch identity is canonical as `(tenantId, branchId)`. Models that physically contain `branchId` must also contain `tenantId` and should carry a tenant-scoped index beginning with `[tenantId, branchId]`.

Known topology debt:

- `Order`, `PosTable`, `Warehouse`, `Printer`, and `CashRegister` are tenant-owned but do not yet carry physical `branchId`.
- Operational branch ownership can still be resolved through runtime metadata or app context, but Phase 4 records this as branch topology debt rather than silently treating it as resolved.

## Runtime Snapshot Graph

`RuntimeState` is the canonical persisted runtime snapshot table:

- `tenantId`
- `key`
- `payload`
- `@@unique([tenantId, key])`
- `@@index([tenantId])`

Replay and queue ownership:

- `SyncQueue` is tenant/status indexed for server replay.
- `OfflineEvent` is unique by `(tenantId, eventId)` for idempotent offline replay.

## Catalog Graph

Canonical product runtime identity flows:

`ProductCategory -> Product -> ProductRevision -> runtime catalog snapshot -> order item product snapshot`

`Product` owns current state. `ProductRevision` owns immutable historical snapshots. POS order runtime must not mutate `Product` directly.

## Device And Printer Graph

Device runtime ownership is split by responsibility:

- `TenantDeviceRegistry`: long-lived bridge/device identity, unique by `(tenantId, deviceId)`.
- `DeviceHeartbeat`: active device liveness, unique by `(tenantId, deviceId)`.
- `TenantPrintJob`: print replay/mutation queue, unique by `(tenantId, mutationId)`.
- `Printer` and `PrinterGroup`: tenant-owned printer configuration, branch-specific binding remains debt where not physically modeled.

## Index Contract

Every tenant-scoped business table must have at least one tenant-scoped index. Lookup-heavy tables should use composite indexes beginning with `tenantId`, for example:

- `[tenantId, status]`
- `[tenantId, createdAt]`
- `[tenantId, branchId]`
- `[tenantId, productId]`
- `[tenantId, key]`

