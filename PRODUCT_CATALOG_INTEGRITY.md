# Product Catalog Integrity

No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Current Canonical Product Ownership

`Product` is the current mutable product authority inside the product domain. It carries:

- `tenantId`
- `categoryId`
- `posKey`
- `legacyKey`
- `externalId`
- `revision`
- `lifecycleStatus`
- `publishStatus`
- `productType`
- `active`

Important tenant-scoped indexes:

- `[tenantId]`
- `[tenantId, productType, active]`
- `[tenantId, lifecycleStatus]`
- `[tenantId, publishStatus]`
- `[tenantId, deletedAt]`
- unique `[tenantId, posKey]`
- `[tenantId, legacyKey]`
- `[tenantId, externalId]`

## Immutable Revision Ownership

`ProductRevision` is the immutable product snapshot authority:

- `tenantId`
- `productId`
- `productPosKey`
- `revision`
- `lifecycleStatus`
- `publishStatus`
- `snapshot`

It is uniquely scoped by `[tenantId, productId, revision]`.

## Category Ownership

`ProductCategory` is tenant-owned and carries visibility governance:

- `allowedProductTypes`
- `visibleInPos`
- `visibleInInventory`
- `visibleInProduction`
- `branchVisibility`
- lifecycle fields such as `archivedAt` and `deletedAt`

## Catalog Debt

- `Product.categoryId` is nullable. This supports legacy and template import compatibility, but operational catalogs should prefer categorized products.
- `Product.posKey` is nullable even though POS runtime wants canonical identity. The unique tenant/posKey index exists, but production product rows should be audited for missing POS keys before tightening.
- `legacyKey` and `externalId` remain compatibility fields. They must not become runtime authority.

## Gate

The Phase 4 validator enforces product tenant ownership, lifecycle fields, revision ownership, tenant-scoped product indexes, and immutable revision snapshot presence.

