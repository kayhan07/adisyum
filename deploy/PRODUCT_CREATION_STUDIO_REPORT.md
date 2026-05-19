# Product Creation Studio Architecture

Date: 2026-05-19

## What Changed

- Replaced the generic quick-create mental model with a Product Creation Studio.
- Added separate creation choices for:
  - Hammadde / stock item
  - Satış ürünü / sale product
  - Yarı mamül / semi product
  - Combo product
  - Modifier group
  - Variant group
- Product creation now sets locked domain intent at draft time.
- Stock and semi-product creation goes to inventory/raw-material state, not POS sale catalog.
- Sale and combo product creation goes to sellable product state with explicit `productType`.
- Added split entry routes:
  - `/inventory/stock-items`
  - `/products/sale-products`
  - `/products/semi-products`
  - `/products/combo-products`
- Added schema support for category-level `allowedProductTypes`.
- Added schema support for `ProductTemplate.productType` so future template imports do not have to default blindly to `sale_product`.
- Added repair script: `npm run products:repair-domain-boundaries`.

## Domain Invariants

- `stock_item` and `semi_product` are inventory/recipe-only by default.
- `sale_product` and `combo_product` are the only POS/adisyon catalog types.
- Product type is treated as protected domain metadata. Changing it must be done through a repair/migration flow, not an ordinary quick edit.

## Validation

- `npx prisma validate`
- `npm run products:boundary-test`
- `npx tsc --noEmit`
- `npm run build`

## Migration Notes

The repair script runs in dry-run mode by default:

```bash
npm run products:repair-domain-boundaries
```

To apply repairs on the VPS after reviewing the dry-run output:

```bash
DRY_RUN=0 npm run products:repair-domain-boundaries
```

Local dry-run cannot reach the production-only `postgres-primary:5432` host from Windows; run the migration test inside the VPS/container network.
