# Product Domain Boundary Audit

Date: 2026-05-19

## Root Cause

Raw stock items were blocked in the database-backed POS mutation path, but the legacy client runtime sale catalog (`adisyon-sale-products`) could still carry records without a stable `productType`. Product management then hydrated those records into `saleProducts`, and POS-facing clients consumed that runtime catalog.

That made the boundary partially dependent on UI filtering and name inference instead of a guaranteed domain invariant.

## Fix Applied

- Centralized product domain helpers in `lib/product-domain.ts`.
- Defined canonical sellable types: `sale_product`, `combo_product`.
- Defined inventory-only types: `stock_item`, `semi_product`.
- Added POS payload leak detection with `[product-domain-boundary]` logs.
- Hardened `lib/sale-product-catalog.ts` so runtime sale catalog load/save/build removes inventory-only products.
- Hardened `/api/runtime/state/[scope]` so stale runtime snapshots cannot rehydrate inventory items into the sale catalog.
- Added `productType` to POS catalog products and adisyon product payloads.
- Added adisyon click guards that reject inventory-only products before mutation.
- Hardened POS settings overview and POS PLU mapping so stock items are not accepted as sellable products.
- Hardened product management state so new sale products are explicitly created as `sale_product`.

## Regression Coverage

Added `npm run products:boundary-test`.

Validated cases:

- Stock item is not sellable.
- Semi product is not sellable.
- Sale product is visible in POS catalog.
- Combo product is visible in POS catalog.
- POS catalog builder drops inventory-only records even when passed mixed input.

## Validation

- `npm run products:boundary-test`
- `npx tsc --noEmit`
- `npm run build`

All passed.

## Remaining Production Step

Run the deployment pipeline on the VPS after pulling this commit:

```bash
cd /root/adisyum
git pull --ff-only origin main
APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh
```
