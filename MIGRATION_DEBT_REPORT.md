# Migration Debt Report

No destructive migration is introduced in Phase 4. Read-only production data validation remains a separate gate.

## Migration Inventory

Current Prisma migrations:

- `20260513000100_enterprise_multitenant`
- `20260514000000_qr_media_management`
- `20260520000100_product_category_domain_governance`

## Forensic Findings

- The base migration created the enterprise multi-tenant schema in one large step. This makes historical intent harder to audit but does not by itself corrupt ownership.
- Later migrations add media/catalog governance rather than replacing tenant foundations.
- No Phase 4 migration is added because schema cleanup must not risk production data.

## Destructive Migration Rule

Any future migration containing any of the following requires an impact report and rollback strategy before merge:

- `DROP TABLE`
- `DROP COLUMN`
- `TRUNCATE`
- mass `DELETE`
- non-null constraint on a previously nullable ownership field
- uniqueness that could fail on existing tenant data

## Demo Debt

The seed script still contains demo tenant defaults. This is not a migration, but it is deployment-sensitive debt:

- default tenant id: `ABN-48291`
- demo statuses

Seed execution must stay explicit and must not be part of production deploy.

## Gate

The Phase 4 validator rejects destructive migration statements and localhost assumptions in migrations. Existing seed demo defaults are warnings and must remain visible.

