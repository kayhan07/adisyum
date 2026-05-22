# Legacy Database Debt

No destructive migration is introduced in Phase 5.

## Safe to remove

- No database column, index, table, migration, or seed data was removed in Phase 5.

## Migration required

- `prisma/seed.mjs` demo defaults:
  - `ABN-48291`
  - demo tenant/subscription status
  - default admin password
- Nullable ownership debt from Phase 4 remains staged for future migration planning.
- Physical branch ownership for `Order`, `PosTable`, `Warehouse`, `Printer`, and `CashRegister` remains migration-required.

## Preserve for compatibility

- `legacyKey` fields on product/catalog data.
- `TenantStatus.demo` and `SubscriptionStatus.demo` until subscription/business compatibility is audited.
- Template `tenantId @default("system")` ownership for template catalogs.

## Critical - do not remove

- `Tenant.tenantId`
- `Branch.(tenantId, branchId)`
- Product revision snapshots
- RuntimeState tenant/key uniqueness
- SyncQueue and OfflineEvent replay ownership

## Validation

Phase 5 delegates database hard ownership checks to `npm run recomposition:phase4-validate` and tracks legacy seed/demo debt as migration-required.

