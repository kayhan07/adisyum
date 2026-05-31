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
| Yeni tenant oluşturma | WORKING, guarded | Tenant lifecycle | Missing company/admin/password now shows provisioning feedback. |
| Temiz tenant başlangıcı | WORKING, guarded; live QA required | Tenant isolation | Provisioning creates only tenant, subscription, branch, roles and admin user. It no longer creates runtime snapshots, products, categories, stock, cash, current accounts, reports, printer mappings, KDS or demo orders. |
| Şifre değiştirme / süre uzatma | WORKING, guarded; live QA required | Subscription ownership | System Admin PATCH actions now support subscription date edit, add days/months/years, unlimited license, admin password reset and force-password-change metadata. |
| Tenant status management | WORKING, guarded; live QA required | Access control | System Admin can set active, suspended, expired or disabled/blocked and synchronizes subscription status. |
| Tenant forensics visibility | WORKING | Isolation visibility | Tenant drawer now exposes product, stock, current account, report, printer and runtime snapshot counts for clean-tenant verification. |

## System Admin Subscription UI + Turkish Fix Findings

| Finding | Status | Files | Fix |
| --- | --- | --- | --- |
| Abonelik aksiyonları çekmecede görünmüyordu | WORKING | `app/system-admin/page.tsx` | Tenant detay çekmecesi artık doğrudan `Abonelik Yönetimi` sekmesiyle açılıyor; manuel tarih, +30 gün, +1 ay, +1 yıl, limitsiz lisans, durum ve şifre aksiyonları görünür hale getirildi. |
| Abonelik aksiyonları stale UI bırakabiliyordu | WORKING | `app/system-admin/page.tsx`, `app/api/system-admin/tenants/route.ts`, `lib/system-admin/provisioning.ts` | Başarılı işlemden sonra tenant listesi yenileniyor, seçili tenant verisi güncelleniyor ve görünür başarı/hata mesajı basılıyor. |
| Türkçe metinlerde mojibake vardı | WORKING | `app/system-admin/page.tsx`, `app/system-admin/login/page.tsx`, `app/api/system-admin/*`, `lib/system-admin/provisioning.ts`, `lib/db/tenant-repository.ts` | System Admin ve ilgili API mesajlarında bozuk Türkçe karakterler temizlendi. |
| Şifre ve lisans doğrulama scripti eski metin arıyordu | WORKING | `scripts/verify-tenant-access-policy.mjs` | Script yeni Türkçe abonelik yönetimi düğmelerini ve zorunlu şifre değişimi aksiyonunu doğrulayacak şekilde güncellendi. |

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

## System Admin Findings

| Finding | Severity | Security / isolation impact | Affected files | Fix applied |
| --- | --- | --- | --- | --- |
| New tenant provisioning created a tenant runtime state row | HIGH | A clean tenant could start with a browser/runtime restore surface even before restaurant data exists. | `lib/system-admin/provisioning.ts` | Provisioning now keeps company profile in authoritative tenant fields only and does not create runtime snapshots for new tenants. |
| Provisioning rollback did not remove all tenant-scoped business data | HIGH | A failed or rolled-back tenant could leave orphan products, orders, stock, cash, reports, printer mappings or runtime state behind. | `lib/system-admin/provisioning.ts` | Rollback now deletes tenant-scoped product, stock, order, payment, cash, customer/supplier, report, printer, device and runtime rows before deleting tenant records. |
| System Admin lacked direct operational controls for subscription/status/password recovery | MEDIUM | Operators had limited ability to recover expired/suspended tenants or force safe password reset from the SaaS panel. | `app/api/system-admin/tenants/route.ts`, `lib/system-admin/provisioning.ts`, `app/system-admin/page.tsx` | Added guarded PATCH actions for subscription edits, duration extension, unlimited license, password reset/force change and tenant status updates. |
| Clean tenant verification was not visible from the tenant drawer | MEDIUM | Cross-tenant leakage or accidental seeded data required manual DB checks. | `lib/system-admin/provisioning.ts`, `app/system-admin/page.tsx` | Tenant rows now include product/category/stock/recipe/current-account/cash/report/printer/runtime counts and the drawer displays them. |

## Tenant Lifecycle Findings

| Finding | Severity | Lifecycle impact | Affected files | Fix applied |
| --- | --- | --- | --- | --- |
| Expired tenant access was all-or-nothing | HIGH | Expired tenants could not log in for read-only review, while the desired lifecycle behavior is read access with new mutations blocked. | `lib/db/tenant-repository.ts`, `lib/requireTenant.ts`, `app/api/auth/login/route.ts`, `app/api/auth/session/route.ts`, `app/api/auth/me/route.ts` | Expired tenants can keep read-only access through GET/HEAD checks, but POST/PATCH/DELETE tenant endpoints remain blocked. Suspended and disabled/blocked tenants remain fully blocked. Unlimited licenses are recognized from subscription metadata. |
| Reactivating or extending an expired subscription could leave stale canceled/expired state | HIGH | System Admin could set a future/unlimited date while the subscription status still prevented login. | `lib/system-admin/provisioning.ts` | Subscription extension and unlimited license actions now reactivate the latest subscription when the resulting expiry is valid; setting tenant status back to active extends an already-expired latest subscription by a recovery-safe 30 days. |
| Duplicate tenant creation was only protected by tenant code | HIGH | Same company, tax number or admin email could create conflicting SaaS tenants. | `lib/system-admin/provisioning.ts` | Provisioning queue creation now rejects conflicts by tenant code, company name, tax number and admin email before a job is queued. |
| Tenant health dashboard lacked lifecycle scale indicators | MEDIUM | Operators could not quickly audit table/order/sales volume, last login or footprint from the tenant drawer. | `lib/system-admin/provisioning.ts`, `app/system-admin/page.tsx` | Tenant rows now include table count, order count, total paid sales, last login and database footprint, and the drawer displays them. |
| Tenant export path was missing from System Admin tenant operations | MEDIUM | Support could not export tenant products, recipes, stock, cari and settings from the management center. | `app/api/system-admin/tenants/route.ts`, `lib/system-admin/provisioning.ts`, `app/system-admin/page.tsx` | Added guarded System Admin export JSON for products, recipes, stock, cari and settings/printer mappings. |

## Tenant Access Policy Findings

| Status / area | Result | APIs audited | Risk found | Fix applied |
| --- | --- | --- | --- | --- |
| active / trial / demo | WORKING | Web login, session, `requireTenant`, POS/product/runtime/printer APIs | No blocking regression found; writes remain allowed while the subscription is valid. | Added `tenant:access-policy` validation script to pin the method/status matrix. |
| expired | WORKING, guarded | Web login, `/api/auth/me`, all `requireTenant` guarded APIs | Expired tenants previously behaved as all-or-nothing access. | Expired tenants can authenticate and perform GET/HEAD read access, while POST/PATCH/PUT/DELETE mutations are rejected by `assertTenantCanAccess(..., readOnly: false)`. |
| suspended / blocked / disabled | WORKING, guarded | Web login, POS order/payment, runtime state, printer/device APIs | Guard relied on active-subscription failure rather than an explicit status matrix. | `assertTenantCanAccess` now explicitly blocks suspended and blocked tenants for read and write. |
| deleted tenant | WORKING, guarded | Web login, session restore, tenant API guard | Soft-deleted tenant state was not explicitly part of the access guard. | Tenant access guard and login/session routes now read and reject `deletedAt` tenant/user state. |
| unlimited license | WORKING, guarded | Web login, session creation, tenant API guard | Unlimited license had to avoid stale end-date rejection. | Subscription metadata `unlimitedLicense` bypasses end-date checks while status remains active/trial/demo. |
| desktop / printer bridge | WORKING, guarded | Device registry, printer print-requests, POS mapping/settings APIs | Expired tenant could potentially mutate if method enforcement drifted. | All existing bridge/printer routes remain behind `requireTenant`; method mapping now blocks expired write calls and allows only read calls. |
| System Admin lifecycle override | WORKING, guarded | `/api/system-admin/tenants` | Reactivating expired tenants could leave stale subscription conflicts. | Subscription/status actions now normalize status/date together, and duplicate tenant checks run before provisioning jobs are queued. |

## System Admin Subscription UI Findings

| Finding | Result | Affected files | Fix applied |
| --- | --- | --- | --- |
| Subscription drawer hid key license fields | WORKING | `app/system-admin/page.tsx`, `lib/system-admin/provisioning.ts` | Tenant rows now expose subscription id, start date, end date, remaining days, unlimited license state, subscription updated date, admin email, admin username and access-policy summary. |
| Subscription actions were partially wired | WORKING | `app/system-admin/page.tsx`, `lib/system-admin/provisioning.ts` | Drawer now exposes manual expiry edit, +30 days, +1 month, +1 year, set unlimited, remove unlimited, active/suspended/expired/blocked/disabled status actions, reset password and force password change. |
| Unlimited license could not be removed | WORKING | `lib/system-admin/provisioning.ts` | `updateTenantSubscription` now treats `unlimitedLicense: false` as an explicit metadata update and clears the unlimited flag without creating duplicate subscriptions. |
| Invalid manual expiry date lacked a hard guard | WORKING | `app/system-admin/page.tsx`, `lib/system-admin/provisioning.ts` | UI validates the date before PATCH and backend rejects invalid dates before writing subscription state. |
| Failed System Admin actions were not visible enough | WORKING | `app/system-admin/page.tsx` | Tenant management PATCH failures now log `console.error('[system-admin] subscription action failed', context)` and show a visible drawer message. |
| Tenant list did not open the management drawer directly | WORKING | `app/system-admin/page.tsx` | Tenant rows now expose a direct management action so subscription controls are visible from the main subscription table. |

## Silent Failure Cleanup

| Area | Status | Notes |
| --- | --- | --- |
| Business stores | Pass | Persistence catches now log `[business-flow] ... failed`. |
| Products module | Pass | Critical create/category/recipe no-op exits now show safe feedback. |
| Finance module | Pass | Critical create/ledger no-op exits now show safe feedback. |
| Floor module | Pass | Critical move/merge/selected-transfer missing state now logs and shows feedback. |

## Advanced Subscriber Management UI Findings

| Finding | Status | Files changed | Fix applied |
| --- | --- | --- | --- |
| Abone Yönetimi ana ekranı yeterince kapsamlı değildi | WORKING | `app/system-admin/page.tsx` | Toplam Abone, Aktif Abone, Süresi Dolan, Askıya Alınan, Limitsiz Lisans ve Silinmiş Abone istatistik kartları eklendi. |
| Abone tablosu profesyonel SaaS yönetim tablosu gibi değildi | WORKING | `app/system-admin/page.tsx` | Telefon, Vergi No, Abonelik, Bitiş Tarihi, Kalan Gün, Limitsiz, Son Giriş ve görünür İşlemler kolonları eklendi. |
| Satır aksiyonları eksikti | WORKING | `app/system-admin/page.tsx` | Her satıra `Yönet`, `Askıya Al`, `Aktif Yap` ve görünür `Sil` butonları eklendi. |
| Abone detay paneli tek form gibi kalıyordu | WORKING | `app/system-admin/page.tsx` | Detay çekmecesi Genel Bilgiler, Abonelik, Kullanıcı & Şifre, Durum, Veri Özeti, Dışa Aktar ve Tehlikeli İşlemler sekmeleriyle düzenlendi. |
| Abonelik aksiyonları görünür değildi | WORKING | `app/system-admin/page.tsx` | Kullanım Tarihini Değiştir, +30 Gün, +1 Ay, +1 Yıl, Limitsiz Lisans Yap ve Limitsiz Lisansı Kaldır butonları görünür hale getirildi. |
| Abone silme ana listeden erişilebilir değildi | WORKING | `app/system-admin/page.tsx`, `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts` | Soft delete akışı hem satır aksiyonundan hem Tehlikeli İşlemler sekmesinden abone kodu onayıyla çalışır hale getirildi. |
| Silinen abone geri alınamıyordu | WORKING | `app/system-admin/page.tsx`, `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts` | `Aboneyi Geri Al` ve `Silinmişten Geri Al` aksiyonları deletedAt alanını temizleyip tenantı güvenli şekilde geri getiriyor. |
| Hata görünürlüğü eski log anahtarına bağlıydı | WORKING | `app/system-admin/page.tsx` | Tüm tenant yönetim hataları `console.error('[system-admin] tenant management action failed', context)` ile loglanıyor ve UI'da Türkçe mesaj gösteriliyor. |
| Türkçe metin bozulmaları vardı | WORKING | `app/system-admin/page.tsx`, `scripts/verify-tenant-access-policy.mjs`, `FULL_BUSINESS_RECOVERY_MATRIX.md` | System Admin UI metinleri ve doğrulama beklentileri düzgün Türkçe karakterlerle güncellendi. |

## Advanced System Admin Subscriber Management Findings

| Finding | Status | Files changed | Fix applied |
| --- | --- | --- | --- |
| Abone Yönet basit kart görünümünde kalıyordu | WORKING | `app/system-admin/page.tsx` | Ana alan profesyonel abone listesi, arama, durum filtreleri, kalan gün, limitsiz lisans ve doğrudan `Yönet` aksiyonuyla genişletildi. |
| Detaylı abone profil ekranı yoktu | WORKING | `app/system-admin/page.tsx`, `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts` | Detay çekmecesine Genel Bilgiler, Abonelik, Kullanıcı & Şifre, Lisans / Durum, Veri Özeti, Yazıcı / Entegrasyon, Dışa Aktar ve Tehlikeli İşlemler sekmeleri eklendi. |
| Firma profili güncellenemiyordu | WORKING | `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts`, `app/system-admin/page.tsx` | Firma adı, ticari ünvan, vergi no, telefon, e-posta, yetkili kişi, adres ve notlar System Admin API üzerinden audit log ile güncelleniyor. |
| Abone silme güvenli değildi veya görünür değildi | WORKING | `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts`, `app/system-admin/page.tsx` | `Aboneyi Sil` soft delete yapıyor: `deletedAt` set ediliyor, status `blocked` oluyor, oturumlar iptal ediliyor, veri korunuyor ve abone kodu onayı isteniyor. |
| Silinen aboneyi geri alma yoktu | WORKING | `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts`, `app/system-admin/page.tsx` | `Aboneyi Geri Al` deletedAt alanını temizliyor, tenantı güvenli şekilde askıya alınmış durumda geri getiriyor ve demo veri oluşturmuyor. |
| Kullanıcı kilitleme ve açma aksiyonları eksikti | WORKING | `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts`, `app/system-admin/page.tsx` | Admin kullanıcı aktifliği System Admin üzerinden değiştiriliyor, işlem audit log ile izleniyor. |
| Yazıcı entegrasyon aksiyonları ölü butondu | WORKING | `lib/system-admin/provisioning.ts`, `app/api/system-admin/tenants/route.ts`, `app/system-admin/page.tsx` | Yazıcı eşleşmesi temizleme, bridge yenileme ve test print isteği tenant-scoped API aksiyonu olarak loglanıyor. |
| Tenant export görünürlüğü eksikti | WORKING | `app/system-admin/page.tsx`, `app/api/system-admin/tenants/route.ts`, `lib/system-admin/provisioning.ts` | Ürün, cari, stok, reçete, ayar ve tüm tenant JSON dışa aktarım butonları tenant-scoped export endpointine bağlandı. |
| Tenant health eksikti | WORKING | `app/system-admin/page.tsx`, `lib/system-admin/provisioning.ts` | Ürün, kategori, hammadde, reçete, stok, cari, kasa, sipariş, ödeme, rapor, yazıcı, runtime snapshot ve satış sayaçları görünür hale getirildi. |
| Kalan risk | PARTIAL | Production/live QA | Bridge yenileme ve test print aksiyonları mevcut mimari içinde talep/audit işareti üretir; fiziksel cihaz komutunun sahada doğrulanması gerekir. |
