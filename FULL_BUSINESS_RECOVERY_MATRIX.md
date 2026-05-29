# Full Business Recovery Matrix

Last updated: 2026-05-28

Scope: Adisyum POS/ERP business recovery only. No architecture expansion, no new runtime layer, no communication-platform scope.

## Masalar / Adisyon

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Masa -> adisyon -> urun ekleme | WORKING, live QA required | API/DB | Click, payload, optimistic UI and `/api/pos/table-orders` flow is active. Production must confirm 200 with authenticated session. |
| Urun silme / adet degisimi | WORKING, live QA required | DB persistence | Increment, decrement, return and delete now persist through `/api/pos/table-orders` outside React state updaters, then reconcile authoritative table state. Missing DB rows return controlled errors instead of hidden 500s. |
| Rapid line mutation spam | WORKING, guarded | Race prevention | Same table line now has an in-flight guard, so rapid duplicate quantity/delete clicks do not launch concurrent DB mutations for the same line. |
| Hesap alma / masa kapatma | WORKING, guarded | Ledger/table cleanup | Full payment closes local table state and calls `close_table_payment`; submit is now in-flight guarded so rapid double taps cannot start duplicate payment finalization. Live journal/kasa proof still required. |
| Masa tasima | WORKING, guarded | State cleanup | Missing source/target table now surfaces `[business-flow]` error and UI message; local authoritative order snapshot is refreshed after move. |
| Masa birlestirme | WORKING, guarded | Merge integrity | Missing source/target table now surfaces `[business-flow]` error and UI message; local authoritative order snapshot is refreshed after merge. |
| Secili urun aktarimi | WORKING, guarded | Partial transfer | Missing selection panel now surfaces `[business-flow]` error and UI message; split/undo blocked states are now visible instead of silent no-op. |
| Masalar ekran aksiyonlari | WORKING, guarded | UI dead action | Quick note, reservation, quick clear and invalid move/merge target selections now surface `[business-flow]` errors and operator feedback instead of silent no-op. |
| KDS sync | PARTIAL, live QA required | Sync visibility | Product insertion must be verified against KDS screen after backend 200. |
| Multi-terminal same table | PARTIAL, live QA required | Reconciliation | Line edits publish tenant order events and return authoritative table state. Requires two-browser live proof for add/delete/quantity/payment. |
| Hesap adisyonu yazdirma | WORKING, guarded | UI dead action | Disabled or invalid print attempts now surface `[business-flow]` console errors and UI feedback instead of silently returning. |
| POS/API side-effect visibility | WORKING, guarded | Hidden async failure | Table-order tenant events, operational event recording, POS catalog publication, printer queue event publishing and runtime state delete misses now log contextual warnings instead of disappearing silently. |

## Gunluk Rapor / Kasa

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Gun sonu snapshot | PARTIAL, live QA required | Report duplication | Existing guard blocks open tables before end-of-day. Manual duplicate report test required. |
| Ana kasa aktarimi | PARTIAL, live QA required | Ledger consistency | Cash/account movement helpers are still existing owners. |
| Devir bakiyesi | PARTIAL, live QA required | Balance correctness | Requires live tenant data verification. |

## Urunler

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Kategori ekleme | WORKING | Persistence/cache | Custom categories persist after refresh; empty category is no longer silent. Browser-local fallback is tenant-scoped and only reads legacy global key for `ABN-48291` migration. |
| Hammadde ekleme | WORKING, guarded | Product domain | Empty name is no longer silent. POS catalog exclusion remains intentional. Browser-local fallback is tenant-scoped. |
| Satis urunu ekleme | WORKING, guarded | Catalog visibility | Empty name is no longer silent; catalog refresh must be live verified. Browser-local fallback is tenant-scoped and cannot leak into a different tenant session. |
| Hizli satis urunu | WORKING, guarded | Catalog visibility | Empty quick product name is no longer silent. |
| Recete satiri | WORKING, guarded | Stock deduction | Missing product/ingredient/quantity now shows feedback. Recipe pool fallback is tenant-scoped. |
| Recete havuzu yayinlama | WORKING, guarded | Versioning | Empty recipe publish is no longer silent. Tenant-scoped browser fallback prevents stale recipe reuse across tenants. |

## Cari / Kasa

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Tahsilat | WORKING, guarded | Ledger | Missing account or invalid amount now shows feedback. |
| Odeme | WORKING, guarded | Ledger | Missing account or invalid amount now shows feedback. |
| Stok/urun karti | WORKING, guarded | Product/stock | Empty stock card names are no longer silent. |

## System Admin

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Yeni tenant olusturma | WORKING, guarded | Tenant lifecycle | Missing company/admin/password now shows provisioning feedback. |
| Temiz tenant baslangici | PARTIAL, live QA required | Tenant isolation | Must verify new tenant has no demo/cross-tenant product, stock, cari or kasa data. |
| Sifre degistirme / sure uzatma | PARTIAL, live QA required | Subscription ownership | Existing screens/routes require manual validation. |

## Persistence / Authoritative State

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Runtime tenant switch safety | WORKING, guarded | Cross-tenant snapshot leakage | `lib/client/runtime-state.ts` now tracks the active tenant identity. When tenant identity changes in the same browser, pending flushes are cancelled, tenant snapshot memory is cleared, stale bootstrap state is dropped and the tenant BroadcastChannel is recreated with a tenant-specific key. |
| Runtime stale table snapshot rejection | WORKING, guarded | Stale hydration | Table runtime snapshots keep version/updatedAt metadata and reject older incoming table snapshots while preserving newer local table keys. `/api/runtime/state/[scope]` now stamps server snapshots with tenant, scope, schema, timestamp and TTL metadata. Tenant/schema mismatches are rejected, legacy snapshots are backfilled with metadata, expired volatile table keys are discarded, and oversized snapshots are pruned safely. |
| Product/category/raw/recipe local fallback | WORKING, guarded | Cross-tenant localStorage leakage | `lib/sale-product-catalog.ts`, `app/products/page.tsx`, `lib/raw-ingredient-store.ts` and `lib/recipe-pool.ts` use tenant-scoped local fallback keys. Legacy unscoped keys are migration-only for `ABN-48291`. |
| Printer integration local fallback | WORKING, guarded | Stale printer mapping | `lib/integration-store.ts` uses tenant-scoped local fallback keys so saved printer mappings survive refresh without crossing tenants. |
| Warehouse/ledger/runtime stores | WORKING, guarded | Tenant-scoped runtime state | Warehouse, access, cari/kasa, treasury, payment journal, layout and table state stores persist through `readRuntimeItem('tenant', ...)`, which is now protected by active tenant identity reset. |

## Production Observability / Long Session Stability

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| POS product mutation timing | WORKING, guarded | Slow mutation / retry visibility | Product add logs now include tenantId, tableId, mutationId, runtimeScope, timestamp and durationMs. Mutations slower than 3000 ms emit `[business-flow] slow product mutation`. |
| POS line mutation timing | WORKING, guarded | Duplicate mutation / race visibility | Quantity/delete mutations now log durationMs and tenant/runtime context. In-flight duplicate skips include mutationId and inFlightCount. Slow line mutations emit `[business-flow] slow line mutation`. |
| Payment timing and duplicate visibility | WORKING, guarded | Duplicate payment / partial finalize | Payment commit now gets a payment mutationId, tenant context, timestamp and durationMs. Duplicate submits and table-close failures include contextual metadata; slow commits warn after 5000 ms. |
| Masa move/merge timing | WORKING, guarded | Operational anomaly visibility | Move/merge commit and blocked-target logs include tenantId, runtimeScope, timestamp and durationMs so stale UI actions are traceable. |
| Runtime snapshot observability | WORKING, guarded | Snapshot growth / stale hydrate | Runtime refresh, bootstrap, broadcast, persist and stale snapshot logs now include tenantId, runtimeScope, snapshot key count, snapshot bytes, pending flush, channel count and runtimeSnapshotVersion. Snapshots larger than 512 KB emit a warning before persist/write. |
| Local agent / printer telemetry | WORKING, guarded | Printer reconnect / silent failure | Direct local agent, proxy fallback, status checks and printer scans now log durationMs, timestamps, printer counts and failure context. |
| Global runtime error surface | WORKING, guarded | Hidden runtime degradation | Window `error` and `unhandledrejection` listeners now remain active even in product recovery minimal runtime mode and log tenant/scope/timestamp context without enabling advanced runtime layers. |
| KDS timing and failure surface | WORKING, guarded | Stale KDS / hidden status rollback | KDS refresh/status updates now log slow refresh/status operations, missing ticket skips, auth-lock blocks and rollback failures with tenant/station/timing context. |
| Tenant runtime activation visibility | WORKING, guarded | Silent bootstrap failure | Tenant runtime initialize/activate now catches rejected bootstrap/clear promises and warns with tenant/scope metadata instead of silently swallowing activation failures. |
| Alert delivery visibility | WORKING, guarded | Silent notification failure | Alert delivery channels keep fire-and-forget behavior but now warn with tenantId, alertId, channel and timestamp when delivery promises reject. |
| POS runtime sync timing | WORKING, guarded | Slow reconcile / hidden fetch failure | Authoritative POS hydration and interval/focus reconciliation diagnostics now include durationMs and structured failure payloads. |

## Business Critical Risks

| Issue | Severity | Business impact | Revenue impact | Affected module | Affected files | Fix applied |
| --- | --- | --- | --- | --- | --- | --- |
| Full payment could write local journal/cari before server table close | CRITICAL | Operator could see payment success while the authoritative table stayed open after an API failure. | Potential duplicate collection, stale open table and day-end mismatch. | Masa/adisyon payment | `components/order-composer.tsx`, `app/api/pos/table-orders/route.ts` | Full payment now closes the authoritative table through `/api/pos/table-orders` before local journal/cari/kasa side effects. If server close fails, no local financial side effect is committed and the operator sees a retry message. |
| Duplicate full payment close could create repeated financial intent | HIGH | Rapid/repeated close requests could represent the same paid order more than once. | Potential duplicate payment rows and incorrect revenue totals. | POS payment API | `app/api/pos/table-orders/route.ts` | Table close transaction now records a paid `Payment` row once per order and warns/skips repeated paid payment closes while still cleaning stale order lines safely. |
| Missing order during payment close was silently treated as success | HIGH | A client with stale table state could believe the payment closed when no authoritative order existed. | Potential missing payment/order reconciliation. | POS payment API | `app/api/pos/table-orders/route.ts` | Missing authoritative order now returns `409 order_not_found_for_payment`, preventing local financial commit and surfacing the mismatch. |
| Payment journal rows used random IDs | HIGH | Refresh, retry or multi-terminal replay could write the same successful payment into local daily report more than once. | Duplicate report revenue, duplicate cash/POS handover totals. | Floor daily report / payment journal | `lib/payment-journal-store.ts`, `components/order-composer.tsx` | Journal entries now carry deterministic `reconciliationKey` values derived from table + payment mutation + method. The store deduplicates by reconciliation key before saving. |
| Paid order total could differ from accepted payment amount | HIGH | Discounts or adjusted settlement could leave paid order totals out of sync with payment/report totals. | Order total vs payment total mismatch in reconciliation. | POS payment API | `app/api/pos/table-orders/route.ts` | Table close now stores paid order subtotal, discount, total, paymentAmount and prePaymentLineTotal metadata so paid order total reconciles to the accepted payment amount. |

## Silent Failure Cleanup

| Area | Status | Notes |
| --- | --- | --- |
| Business stores | Pass | Persistence catches now log `[business-flow] ... failed`. |
| Products module | Pass | Critical create/category/recipe no-op exits now show safe feedback. |
| Finance module | Pass | Critical create/ledger no-op exits now show safe feedback. |
| Floor module | Pass | Critical move/merge/selected-transfer missing state now logs and shows feedback. |
