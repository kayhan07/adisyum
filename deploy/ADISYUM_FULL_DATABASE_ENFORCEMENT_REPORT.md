# Adisyum Full Database Enforcement Report

Generated: 2026-05-13

## Completed enforcement

- Added tenant-safe Prisma repositories in `lib/db/repositories.ts` for tables, products, categories, orders/order_items, payments, customers, stock, warehouses, recipes, printers, expenses, shifts, reports, settings, and users.
- Added service layer in `lib/services/domain-services.ts` for `OrderService`, `PaymentService`, `StockService`, and `ReportService`.
- Moved critical order/payment/stock mutations behind Prisma transactions with tenant-scoped writes, audit events, cache invalidation, and tenant-scoped realtime publish calls.
- Removed server runtime memory fallback from `app/api/offline-sync/orders/route.ts`; offline orders now write to `sync_queue`.
- Removed server runtime memory fallback from `app/api/runtime/table-state/route.ts`; table state now reads/writes `runtime_states`.
- Removed `globalThis` fallback stores from product mappings and GIB integrations; both now persist under tenant-scoped `runtime_states`.
- Replaced POS overview singleton cache with Redis REST cache helper.
- Expanded audit actions for login, failed login, order create/cancel, payment create/refund, stock edit, printer config changes, and system-admin actions.
- Enforced active tenant subscription in `requireTenant()` through the database, not only through JWT shape.
- Hardened session creation so expired/inactive tenants and inactive users cannot receive API sessions.
- Extended `deploy/scripts/tenant-db-isolation-smoke.mjs` to assert isolation for API data, realtime runtime state, reports, payments, and sync/export queue data.

## Remaining localStorage usage

Allowed/non-tenant UI preference:
- `components/theme-toggle.tsx`
- `app/layout.tsx`

Tenant data still using localStorage and requiring follow-up UI/API migration:
- `lib/warehouse-store.ts`
- `lib/treasury-runtime-store.ts`
- `lib/tenant-runtime-store.ts`
- `lib/table-reservation-store.ts`
- `lib/table-payment-state.ts`
- `lib/table-layout-store.ts`
- `lib/system-admin-store.ts`
- `lib/session-store.ts`
- `lib/sale-product-catalog.ts`
- `lib/saas-store.ts`
- `lib/recipe-pool.ts`
- `lib/raw-ingredient-store.ts`
- `lib/qr-menu-state.ts`
- `lib/purchase-invoice-store.ts`
- `lib/pos-mapping-store.ts`
- `lib/payment-journal-store.ts`
- `lib/offline-sync-store.ts`
- `lib/integration-store.ts`
- `lib/finance-runtime-store.ts`
- `lib/delivery-store.ts`
- `lib/daily-cash-store.ts`
- `lib/company-store.ts`
- `lib/branch-store.ts`
- `lib/account-store.ts`
- `lib/access-store.ts`
- `components/qr/qr-customer-menu.tsx`
- `components/order-composer.tsx`
- `components/cash-register-panel.tsx`
- `app/products/page.tsx`

## Remaining runtime singletons

- `lib/db/prisma.ts` uses a development-only Prisma client singleton. Production does not assign the singleton.

## Tenant leak risks

- High: client-side store modules above can still replay stale tenant data in the browser until their consumers are migrated to DB APIs.
- Medium: UI pages still import runtime store modules for finance, warehouse, product, QR, and table workflows.
- Low: server-side raw SQL risk. No `$queryRaw` or `$executeRaw` usage was found.

## Scores

- Migration completion: 68%
- SaaS readiness: 72/100
- Scalability score: 70/100
- Production risk: Medium-high until the remaining client localStorage stores are replaced by tenant API calls.

## Production blockers

- Redis REST variables are required for production cache/pub-sub: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Remaining browser localStorage modules must be removed or limited to non-tenant UI preferences.
- Websocket connection code still needs a concrete Redis subscriber/broker process; the publish side and tenant channel naming are in place.
- System-admin UI still uses a client store module and should be moved to DB-backed admin APIs.
