# Product / Stock Domain Separation

## Problem

Raw stock materials were able to appear in POS/adisyon product selection surfaces. This is operationally unsafe because inventory cards such as milk, tomato, flour or coffee beans are not sellable POS products.

## Canonical Domain Model

Adisyum now separates:

- `stock_item`: raw material, inventory-only
- `sale_product`: sellable POS product
- `semi_product`: prepared intermediate item, inventory/recipe-only by default
- `combo_product`: sellable menu/combo product

## Enforcement

### Database

`Product.productType` was added with default `sale_product`.

Indexed by:

- `tenantId`
- `productType`
- `active`

### POS Runtime

`POST /api/pos/table-orders` rejects inventory-only product mutations:

- `stock_item`
- `semi_product`

If a product id is provided, the API verifies the persisted product is active and sellable before allowing insertion into an order.

### Product Queries

Tenant product lists and product repositories now return only:

- `sale_product`
- `combo_product`

Stock cards continue to use `StockItem` and remain available to inventory, purchase, recipe and stock report flows.

### Client POS Catalog

The local POS catalog builder filters non-sellable product types. It also applies a conservative classifier for legacy client-side sale-product snapshots so obvious raw materials do not leak into adisyon after refresh.

### Template Imports

Template-imported products are explicitly created as `sale_product`. Recipe ingredients continue to create `StockItem` rows and are not live POS products.

## Migration

Script:

```bash
npm run products:classify-types
```

Deploy pipeline runs this after:

```bash
npx prisma db push
```

The script scans existing `Product` rows and classifies likely raw materials as `stock_item`. Existing template-imported menu products stay as `sale_product`.

## Validation

Completed locally:

- `npx prisma validate`
- `npx prisma generate`
- `npx tsc --noEmit`
- `npm run build`

Local classification script could not be executed because local PostgreSQL was not reachable at `localhost:5432`. The production deploy pipeline runs it after a successful DB connection and `prisma db push`.

## Expected Behavior

- Stock items appear in inventory, stock intake, purchase, recipe and stock reports.
- Stock items do not appear in adisyon, POS product selection or quick sale areas.
- Sale products appear in adisyon, POS, QR menu and online ordering.
- Recipes connect sale products to stock items for stock consumption.
