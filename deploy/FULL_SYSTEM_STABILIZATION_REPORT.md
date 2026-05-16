# Adisyum Full System Stabilization Report

## Audit Scope

Static audit covered `app`, `components`, and `lib` application code: 203 files. The pass focused on runtime state, tenant isolation, mutation lifecycle, local runtime sync, offline queue behavior, POS flow, QR/KDS/payment adjacent flows, and production error handling.

## Executive Findings

| Severity | Area | Root Cause | Fix Applied |
| --- | --- | --- | --- |
| Critical | POS product insertion | Product insertion was blocked by missing POS PLU mappings, even when the table/order state was valid. | Missing mappings now auto-create deterministic local PLU records before insertion. |
| Critical | Table navigation | Entering an order auto-opened the table-card modal, creating a dead-end feel before the adisyon flow. | Removed automatic table-card modal and added explicit `Masalara dön` exit. |
| Critical | Runtime sync | Runtime bootstrap/server snapshot could overwrite fresh local order mutations. | Runtime sync now guards fresh local writes and keeps local snapshots on transient sync failure. |
| High | Offline queue | Every order-state change queued every table, inflating failed queue counts such as `Hata var 50`. | Queue writes now target the active order/table; non-blocking failed order snapshots no longer poison POS status. |
| High | Queue cleanup | IndexedDB cleanup called `getAll()` twice and read the wrong request result. | Fixed tenant-scoped queue cleanup request handling. |
| High | Global runtime errors | Client runtime errors and unhandled promise rejections were not centrally captured. | Added global runtime error/rejection diagnostics ingestion and route error boundary. |
| Medium | Legacy service mode | Fast/waiter mode and QR waiter-call code left alternate flows. | Removed waiter-mode UI/API/reporting and normalized service copy. |

## Module Risk Notes

- Dashboard/overview: depends on local runtime stores and payment journals; metrics can lag if runtime sync fails, now safer due runtime persist fallback.
- Masa yönetimi: move/merge remain complex and need manual restaurant-floor regression; drag/drop is still an advanced path.
- Adisyon: canonical product add/update/payment path now has mutation logs and local write protection.
- Ürün/kategori: POS mapping is no longer allowed to block adisyon operation; mapping gaps surface as warnings.
- Tahsilat/bölünmüş ödeme: duplicate payment guard exists, but split/account/mixed payment still needs a Playwright regression suite.
- Stok/reçete: stock deduction is tied to sent quantities; returns/complimentary paths remain a consistency risk for future DB-backed transactions.
- Yazıcı/KDS: local-agent failures are caught and surfaced, but hardware validation must happen on site.
- Cari: account charging writes local finance journals; refresh/multi-tab consistency still depends on runtime scope persistence.
- Tenant isolation: API routes mostly require tenant/session context; system-admin observability endpoints intentionally accept tenant parameters and should stay privileged.
- Websocket/realtime: current runtime uses BroadcastChannel/local runtime sync plus KDS connection state; no hard WebSocket payload reconciliation model is present yet.
- Mobile/tablet: no remaining waiter/mobile mode branch found; responsive layout still needs device QA.

## Diagnostics Added

- POS order logs:
  - `table-selected`
  - `add-product-state-transition`
  - `product-mapping-autocreated`
  - `external-sync-applied`
  - `external-sync-skipped-after-local-mutation`
  - `external-sync-failed`
  - `orders-persisted`
- Runtime diagnostics:
  - `window.error`
  - `unhandledrejection`
  - route-level error boundary logs
- POS diagnostics panel:
  - visible in development
  - visible in production with `NEXT_PUBLIC_POS_DEBUG=1`

## Remaining Production Recommendations

1. Add Playwright authenticated POS flows for table open, product add, quantity update, refresh persistence, split payment, and payment completion.
2. Move critical order/payment/stock state from browser runtime storage into transactional API mutations.
3. Add DB-level order/payment/stock transactions for recipe consumption and payment finalization.
4. Add server-side realtime conflict resolution with version stamps instead of last-writer runtime snapshots.
5. Add hardware-in-loop tests for printer, KDS, fiscal POS, and local agent.
6. Add tenant-isolation smoke tests for every API route that accepts tenant IDs from body payloads.
7. Add performance budgets for product, floor, and order screens; `products/page.tsx` and `order-composer.tsx` are large component surfaces.

## Validation Completed Locally

- `npx tsc --noEmit`
- `npm run build`
- Local production smoke:
  - `/floor` returned 200
  - `/orders?tableId=tbl-salon-1` returned auth redirect, which is expected without a browser session
- Public health checks before VPS deploy:
  - `/floor` returned 200
  - `/orders?tableId=tbl-salon-1` returned auth redirect

## Deployment Status

Repository changes are committed and pushed to `origin/main`. VPS deployment still requires SSH access or manual execution on the VPS because remote SSH from this workspace timed out on port 22.
