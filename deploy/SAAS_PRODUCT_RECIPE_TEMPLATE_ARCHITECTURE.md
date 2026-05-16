# SaaS Product and Recipe Template Architecture

## Decision

Adisyum uses a two-layer product onboarding model:

1. System template pool
2. Tenant-owned live copies

Templates accelerate onboarding only. They are never used directly in sales, reporting, stock deduction, or tenant runtime operations.

## System Template Pool

System-owned template rows live independently from tenant runtime data:

- `category_templates`
- `stock_templates`
- `product_templates`
- `recipe_templates`
- `recipe_template_items`

Template rows belong to `tenant_id = "system"` where applicable. Canonical starter templates include examples such as Adana Kebap, Lahmacun, Caffe Latte, Tiramisu, Balik Izgara, and Raki Mezeleri.

## Tenant Runtime Tables

Imported data becomes tenant-owned data:

- `product_categories`
- `products`
- `stock_items`
- `recipes`
- `recipe_items`
- `printer_groups`

Tenant-owned rows may keep `source_template_id` for lineage and analytics, but they do not depend on the source row after import.

## Deep Clone Import

`importProductTemplatesToTenant()` performs one transactional deep clone:

1. Reject duplicate imports using `template_imports`.
2. Create or reuse tenant category.
3. Create or reuse tenant printer group.
4. Create tenant product copy.
5. Create tenant recipe copy.
6. Create missing stock/raw-material cards.
7. Create recipe items linked to tenant-owned stock cards.
8. Record import lineage.
9. Write audit log.

After import the tenant may change price, grams, recipe lines, names, or delete rows without mutating system templates.

## Empty Tenant Rule

Newly provisioned tenants start operationally empty:

- zero orders
- zero payments
- zero reports
- zero stock movements
- zero invoices
- zero customers
- zero imported products
- zero live tables created by provisioning

Provisioning exposes the template pool but does not inject demo products or sales history.

## Automatic Raw Material Creation

When a recipe template includes an ingredient and the tenant has no matching stock item:

- `stock_item` is created automatically
- stock unit is copied
- recipe unit is retained in metadata
- purchase unit is retained in metadata
- minimum/critical stock level is copied
- category lineage is retained in metadata

## Onboarding Surface

Tenant onboarding entry point:

- `GET /products/templates`

Tenant API:

- `GET /api/templates/products`
- `POST /api/templates/import`

System-admin API:

- `GET /api/system-admin/templates`

The tenant-facing pool supports restaurant-type filtering, search, bulk selection, and transactional import.

## Duplicate and Safety Controls

- `template_imports` has a unique `(tenant_id, product_template_id)` constraint.
- Category reuse is tenant-scoped and case-insensitive.
- Stock reuse is tenant-scoped and case-insensitive.
- All imports run inside one database transaction.
- Sales code reads only tenant-owned `products`.

## Future AI Readiness

The architecture supports:

- AI onboarding packs
- AI menu generation
- AI recipe recommendations
- AI stock optimization
- AI pricing recommendations
- template version analytics
- most-imported template rankings

## Follow-up Production Work

- Template CRUD UI in system-admin
- Template version publish workflow
- Pack/bundle model for restaurant types
- richer price channels as first-class columns or dedicated price table
- mapping tenant table/layout templates separately from product templates
- import preview and rollback UI
