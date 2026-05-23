# API Drift Forensics

Product recovery rule: valid internal runtime APIs must never crash the POS render tree.

## Valid Runtime API Namespaces

- `/api/auth/*`
- `/api/pos/table-orders`
- `/api/runtime/pos-catalog`
- `/api/runtime/state/*`
- `/api/runtime/table-state`
- `/api/runtime-build-id`
- `/api/kds/*`

## Blocked Legacy Namespaces

- `/app/api/*`
- `/adisyonsistemi/api/*`

These paths indicate route-prefix leakage from frontend routing. They are invalid API ownership paths.

## Safe Drift Rule

`buildApiUrl()` may validate path ownership, but it must compare only the pathname portion when a query string or hash exists.

Valid:

- `/api/runtime/pos-catalog?channel=pos`

The pathname is `/api/runtime/pos-catalog`; the query string is not drift.

## Runtime Failure Rule

Invalid API paths must not throw through React render or runtime hydration.

Expected behavior:

- log a warning
- return a safe `400` response from `runtimeFetch`
- let the calling UI show its normal fallback/error state

Forbidden behavior:

- throwing an uncaught exception for valid runtime APIs
- crashing POS catalog hydration
- triggering safe mode for `/api/runtime/pos-catalog`

## POS Catalog Hydration Rule

`/api/runtime/pos-catalog` is a valid runtime API, including query strings such as `?channel=pos` and `?branchId=...`.

During masa open, adisyon mount, and product hydration:

- POS should request `/api/runtime/pos-catalog`
- catalog request failure should log `runtime-catalog-hydration-skipped` or `runtime-catalog-hydration-failed`
- the UI should continue with its existing fallback catalog state
- product insertion should still dispatch `POST /api/pos/table-orders`

The runtime API guard may block legacy prefixes, deprecated runtime paths, invalid namespaces, and wrong-host ownership. It must not block valid internal runtime APIs.
