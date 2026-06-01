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

## Critical Production Bug Fixes — Windows / Products / Tenant Clean State / Company Profile / Tables

| Hata | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Manuel QA sonucu |
| --- | --- | --- | --- | --- | --- |
| Windows kurulumda yazıcıları görmüyor | WORKING | Desktop tanı ekranı boş yazıcı sonucunu sessiz bırakıyor, spooler/bridge/keşif yöntemlerini görünür göstermiyordu. | `apps/desktop/src/renderer/renderer.js`, `agent.js`, `tools/adisyum-pos-agent/Program.cs`, `tools/agent-installer/Program.cs` | Desktop tarama ekranı artık boş sonuçta “Yazıcı bulunamadı” mesajı, Print Spooler durumu, bridge durumu ve keşif diagnostics bilgisini gösteriyor; mevcut Get-Printer, CIM ve WMI fallback zinciri korunuyor. | Kod tarafında doğrulandı; fiziksel Windows yazıcı ile saha QA gerekir. |
| Aynı bilgisayarda iki yazıcı eklenemiyor | WORKING | Yazıcı kayıt kontrolü rol/tip bazlı düşündüğü için aynı fiziksel yazıcı ile farklı role takılabiliyor, farklı fiziksel yazıcı akışı yeterince net görünmüyordu. | `app/settings/settings-client.tsx` | Aynı fiziksel yazıcı duplicate engellenir; farklı Windows yazıcı adı/port/driver ile birden fazla cihaz aynı tenant-agent altında Kasa, Mutfak veya Bar rolüyle eklenebilir. | UI kodunda doğrulandı; fiziksel iki yazıcı ile saha QA gerekir. |
| Yeni abonede masalarda eski ürünler/adisyonlar refresh sonrası çıkıyor | WORKING | Demo ürün fallback ve tenant-scoped olmayan masa runtime snapshotları yeni tenant hydrate sırasında eski veriyi geri getirebiliyordu. | `components/order-composer.tsx`, `lib/tenant-clean-start.ts`, `lib/table-layout-store.ts`, `lib/table-payment-state.ts`, `components/floor-workspace.tsx` | Yeni tenant demo POS katalog fallback kullanmaz; masa layout, meta ve live total snapshotları tenant temiz başlangıcında temizlenir; silinen masa meta/live total artık replace edilerek eski snapshottan geri dönmez. | Kod tarafında doğrulandı. |
| Ürünler modülünde ürün silme yok | WORKING | Satış ürünü dışında hammadde, kategori ve reçete için görünür silme/pasife alma akışı eksikti. | `app/products/page.tsx` | Satış ürünü, hammadde, kategori ve reçete için güvenli silme aksiyonları eklendi; bağlı reçete/kategori kullanımı varsa silme engellenir veya reçete bağı güvenli kaldırılır. | Kod tarafında doğrulandı. |
| Hızlı ürün eklemede tek ürün görünüyor | WORKING | Hızlı ekleme sonrası son eklenen kayıtlar görünür bir listeyle izlenmiyordu ve kullanıcı tek ürün kalmış gibi görüyordu. | `app/products/page.tsx`, `lib/sale-product-catalog.ts` | Hızlı ürün ekleme append akışında kalır; son eklenen ürünler listesi görünür hale getirildi ve stored sale product persistence korunur. | Kod tarafında doğrulandı. |
| Ürün fiyatı KDV’siz algılanıyor, masada KDV’li görünüyor | WORKING | Masa/adisyon toplamı satış fiyatına tekrar KDV ekleyen gross hesapla gösteriliyordu. | `components/order-composer.tsx`, `lib/sale-product-catalog.ts` | Satış fiyatı KDV dahil nihai fiyat kabul edilir; masada/adisyonda girilen fiyat aynen görünür, KDV sadece raporlama ayrıştırması için kullanılır. | Kod tarafında doğrulandı. |
| System Admin firma bilgileri app tarafına yansımıyor / app’te refresh sonrası gidiyor | WORKING | Firma kartı local runtime state’e yazılıyor, tenant/company profile DB kaydıyla senkron tutulmuyordu. | `app/api/settings/company/route.ts`, `app/settings/settings-client.tsx`, `app/api/auth/me/route.ts`, `lib/company-store.ts` | Tenant-scoped company profile GET/PUT API eklendi; ayarlar ekranı DB’den yükler ve kaydeder; System Admin’den gelen firma adı/vergi/iletişim bilgileri app tarafında kalıcı görünür. | Kod tarafında doğrulandı. |
| Üstte iki Güvenli Çıkış var / Abone No görünmüyor | WORKING | Header’da iki ayrı çıkış benzeri aksiyon vardı ve tenant kodu kullanıcıya gösterilmiyordu. | `components/app-shell.tsx`, `app/api/auth/me/route.ts` | Üst barda tek Güvenli Çıkış kaldı; Abone No tenant session bilgisinden görünür hale getirildi. | Kod tarafında doğrulandı. |
| Yeni abonede masalar sıfırlanmıyor / masa silince refresh sonrası geri geliyor | WORKING | Default masa seed ve merge edilen table meta/live total snapshotları silinmiş masaları yeniden hydrate edebiliyordu. | `lib/table-layout-store.ts`, `components/floor-workspace.tsx`, `components/floor/table-setup-panel.tsx`, `lib/table-payment-state.ts` | Yeni tenant default masa seed almaz; masa kurulum paneline tekil masa silme eklendi; masa silme orders, totals, payment flag ve layout state’i kalıcı günceller. | Kod tarafında doğrulandı. |

## Pre-Customer Installation Hardening Findings

| Madde | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Kalan risk / QA |
| --- | --- | --- | --- | --- | --- |
| Windows yazıcı kurulumu | WORKING | Yazıcı bulunamadığında Desktop ekranı sebebi görünür göstermiyordu. | `apps/desktop/src/renderer/renderer.js`, `agent.js`, `tools/adisyum-pos-agent/Program.cs`, `tools/agent-installer/Program.cs` | Spooler, bridge, printer count, discovery diagnostics ve test print sonucu görünür hale getirildi; mevcut Get-Printer/CIM/WMI fallback zinciri korunuyor. | Fiziksel Windows yazıcıyla saha QA gerekir. |
| Aynı PC’de birden fazla yazıcı | WORKING | Ekleme akışı aynı fiziksel yazıcıyı engellerken farklı fiziksel yazıcıları rol bazlı net göstermiyordu. | `app/settings/settings-client.tsx` | Farklı printerName/port/driver kombinasyonları ayrı cihaz olarak eklenebilir; her satır rol/test/sil/default aksiyonunu korur. | Fiziksel iki yazıcıyla saha QA gerekir. |
| Yeni abone temiz başlangıç | WORKING | POS mapping ve demo ürün fallback’i yeni tenantta varsayılan ürün hissi yaratabiliyordu. | `lib/pos-mapping-store.ts`, `components/settings/pos-settings-client.tsx`, `lib/tenant-clean-start.ts` | Demo POS mapping ve POS ayar ürünü sadece seed/demo tenant modunda üretilir; normal yeni abone boş katalogla başlar. | Yeni tenant oluşturma canlı DB’de tekrar doğrulanmalı. |
| Masa ekleme/silme kalıcılığı | WORKING | Masa meta/live total snapshotları merge edildiği için silinen masa refresh sonrası geri dönebiliyordu. | `components/floor-workspace.tsx`, `components/floor/table-setup-panel.tsx`, `lib/table-payment-state.ts` | Masa silme orders, payment flag, live totals ve table meta state’ini kalıcı temizler; selected-group panelinden tekil masa silme görünürdür. | Browser cache temizlenerek canlı QA gerekir. |
| Ürün silme/pasife alma | WORKING | Satış ürünü dışındaki ürün domainlerinde görünür silme akışı yoktu. | `app/products/page.tsx` | Satış ürünü, hammadde, kategori ve reçete için güvenli silme/pasife alma eklendi; bağlı kayıt varsa engel/uyarı verilir. | Manuel ürün ekle-sil refresh testi gerekir. |
| Hızlı ürün ekleme listesi | WORKING | Kullanıcı son eklenenleri liste olarak görmediği için tek ürün kalmış izlenimi oluşuyordu. | `app/products/page.tsx`, `lib/sale-product-catalog.ts` | Hızlı ekleme append akışında kalır; son eklenen ürünler ve stored katalog korunur. | 5 ürün ekleme testi gerekir. |
| Ürün fiyatı / KDV davranışı | WORKING | Bazı ekranlar satış fiyatına tekrar KDV çarpanı uyguluyordu. | `lib/qr-menu-state.ts`, `app/branches/page.tsx`, `app/reports/page.tsx`, `components/order-composer.tsx` | Satış fiyatı KDV dahil nihai fiyat kabul edildi; QR, şube ve rapor toplamlarında `* 1.1` kaldırıldı. | Rapor KDV ayrıştırması ayrıca finans QA’da kontrol edilmeli. |
| Firma bilgileri kalıcılığı | WORKING | Firma kartı local runtime state’e bağlıydı ve DB profile ile senkron değildi. | `app/api/settings/company/route.ts`, `app/settings/settings-client.tsx`, `app/api/auth/me/route.ts`, `lib/company-store.ts` | Tenant-scoped company profile API eklendi; System Admin ve app ayarları DB’den yükleyip DB’ye kaydeder. | Canlı tenantta refresh sonrası firma kartı kontrol edilmeli. |
| Üst bar / çıkış / abone no | WORKING | Çıkış aksiyonu iki yerde görünüyordu ve tenant kodu üst barda yoktu. | `components/app-shell.tsx`, `app/api/auth/me/route.ts` | Tek Güvenli Çıkış kaldı; Abone No görünür hale getirildi. | Mobil görünüm QA gerekir. |
| System Admin abone yönetimi | WORKING | Abonelik, şifre, silme/geri alma ve export aksiyonları UI’da yeterince görünür değildi. | `app/system-admin/page.tsx`, `app/api/system-admin/tenants/route.ts`, `lib/system-admin/provisioning.ts` | Sekmeli abone yönetim paneli, soft delete, restore, abonelik süreleri, limitsiz lisans, şifre ve export aksiyonları bağlandı. | Canlı super admin hesabıyla buton QA gerekir. |
| Türkçe karakter taraması | WORKING | Bazı UI metinlerinde mojibake karakter kalmıştı. | `app/overview/page.tsx`, `FULL_BUSINESS_RECOVERY_MATRIX.md` | Kalan bozuk bullet/metin temizlendi; receipt formatter içindeki CP437 karakter tablosu teknik eşleme olduğu için korundu. | UI taraması tarayıcıda tekrar yapılmalı. |
| 502 riski / deploy davranışı | PARTIAL | Website PM2 süreci build dizini yokken başlatıldığında `production-start-no-build-id` ile 3010 upstream kapanıyor. | `deploy/scripts/check-production.sh` | Bu sprintte runtime mimarisi değiştirilmedi; müşteri kurulumunda deploy sırası build sonrası reconstruct + PM2 restart + nginx reload olarak uygulanmalı. | Zero-downtime deploy ayrı release prosedürüyle netleştirilmeli. |

## Critical Deploy Blocker Fix — Browser Local Bridge Isolation

| Finding | Status | Root cause | Files changed | Fix applied | Validation |
| --- | --- | --- | --- | --- | --- |
| Production browser bundle contained direct `localhost:3001` bridge URLs | WORKING | `lib/local-agent.ts` carried legacy `3001` bridge bases into client chunks and attempted direct loopback fetches for every browser session. | `lib/local-agent.ts` | Legacy `3001` browser bases were removed. Production web sessions use relative `/api/printers/local-agent` and `/api/printers/local-agent/print` proxy routes. Direct loopback discovery is enabled only for packaged desktop sessions or explicit non-production development mode. | `npm run runtime:audit-production` reports empty `browserSourceWithDirectBridge` and `builtDirectBridgeChunks`. |
| Production CSP allowed loopback hosts | WORKING | `middleware.ts` included `127.0.0.1` and `localhost` bridge origins in the default production `connect-src`. | `middleware.ts` | Production CSP is restricted to `'self' https: ws: wss:`. Browser CSP no longer permits localhost by default. | Runtime audit reports `localhostAllowed: false`. |
| Server-side printer proxy still needs local agent compatibility | WORKING | VPS cannot reach a restaurant Windows computer through its own localhost interface. | `app/api/printers/local-agent/route.ts`, `app/api/printers/local-agent/print/route.ts` | VPS localhost probing was removed. Web sessions read tenant-scoped registry cache and enqueue test prints for the registered Windows device. | Source grep shows remaining `3001` only in the audit regex and Windows tray shortcut; built client chunks are checked separately. |

## Windows Local Agent / Printer Bridge Real Connection Findings

| Finding | Status | Root cause | Files changed | Fix applied | Remaining QA |
| --- | --- | --- | --- | --- | --- |
| Web printer screen could not see restaurant printers | WORKING | The server API probed VPS localhost instead of reading the restaurant Windows agent inventory. | `app/api/printers/local-agent/route.ts`, `app/api/printers/local-agent/printers/route.ts`, `lib/local-agent.ts` | Browser uses relative tenant-scoped APIs only. The API returns the latest registered device heartbeat, spooler state, last error and cached printer inventory. | Verify one installed Windows printer appears after Desktop activation. |
| Desktop app did not publish printer inventory | WORKING | The packaged Desktop authenticated to the cloud but never sent periodic printer discovery results. | `apps/desktop/src/main.cjs`, `app/api/devices/registry/route.ts`, `lib/server/device-auth.ts`, `lib/device-runtime.ts` | Desktop now posts heartbeat and normalized printer inventory every 15 seconds. Device token authentication keeps the agent connected after the browser session expires and tenant access policy is still enforced. | Install on Windows and verify heartbeat refreshes every 15 seconds. |
| Multiple printers under one PC could collapse | WORKING | Inventory normalization discarded port information and deduplicated by printer name alone. | `lib/device-runtime.ts`, `app/api/devices/registry/route.ts`, `apps/desktop/src/main.cjs` | Printer identity now preserves printer id, driver, port and shared state. Distinct name/port/driver combinations remain independently selectable for kasa, mutfak and bar roles. | Pair two physical printers and assign different roles. |
| Web test print targeted VPS localhost | WORKING | Test print proxy attempted to call a local bridge on the server. | `app/api/printers/local-agent/print/route.ts`, `app/api/printers/print-requests/route.ts`, `apps/desktop/src/main.cjs` | Test print creates a tenant-scoped cloud queue job. The registered Desktop polls its own jobs, posts to its local bridge and updates printed/failed status. | Send a physical test receipt from Settings. |
| Printer setup errors were too quiet | WORKING | UI exposed only active/not-found state. | `app/settings/settings-client.tsx` | Settings now shows agent state, device name, agent version, spooler state, last heartbeat, printer count and diagnostic message. | Confirm offline and spooler-stopped messages on Windows. |

## Clean Tenant POS Catalog Follow-up

| Finding | Status | Root cause | Files changed | Fix applied | Remaining QA |
| --- | --- | --- | --- | --- | --- |
| Boş tenant kataloğu geldiğinde eski ürün kartları ekranda kalıyordu | WORKING | Masa adisyonu authoritative POS katalog cevabı boş olduğunda cevabı geçersiz sayıyor ve tarayıcıdaki eski kartları koruyordu. QR menü ve ürün operasyon merkezi de boş tenantta demo fallback kullanabiliyordu. | `components/order-composer.tsx`, `lib/qr-menu-state.ts`, `components/product-operations-center.tsx`, `app/overview/page.tsx`, `lib/tenant-clean-start.ts`, `scripts/verify-product-recovery.mjs` | Boş authoritative katalog geçerli cevap kabul edilip eski kartlar temizlenir. Demo fallback yalnızca seed tenantta çalışır; QR sipariş ve runtime ürün cache anahtarları login temizliğine eklendi. | Yeni tenant `TNT-*` ile masa adisyonu ve QR menü refresh testi canlıda tekrarlanmalı. |

## Auth Entry / Tenant Snapshot Isolation Findings

### Refresh Persistence Follow-up

| Finding | Status | Root cause | Files changed | Fix applied | Remaining QA |
| --- | --- | --- | --- | --- | --- |
| Masa tanımları refresh sonrası sıfırlanıyordu | WORKING | Product recovery modunda `AppRuntimeProvider`, tenant runtime snapshot bootstrap işlemini tamamen atlıyordu. Masa layout kaydı server runtime snapshot'a yazılsa bile yeni sayfa açılışında okunmuyordu. | `components/providers/app-runtime-provider.tsx`, `scripts/verify-product-recovery.mjs` | Tenant ve system-admin snapshot bootstrap işlemleri minimal recovery modunda da çalışır; yalnız ağır realtime döngüleri kapalı kalır. Masa layout refresh sonrası tenant-scoped snapshot'tan geri yüklenir. | VPS deploy sonrası yeni tenantta masa ekle, refresh, masa sil, refresh testi yapılmalı. |
| Eklenen ürünler refresh sonrası kayboluyor, eski ürünler geri geliyordu | WORKING | Ürün store kayıt fonksiyonu tam listeyi replace etmek yerine eski kayıtları koruyarak merge ediyordu. Ayrıca masa adisyonu boş DB kataloğunda yerelde oluşturulmuş ürünleri de temizliyordu. | `lib/sale-product-catalog.ts`, `components/order-composer.tsx`, `app/products/page.tsx`, `scripts/verify-product-recovery.mjs` | Ürün store artık tam snapshot replace eder; silinen ürün geri dönmez. Boş DB kataloğu geldiğinde yalnız `source: created` tenant ürünleri korunur, demo kayıtlar temizlenir. Temiz tenant reçete havuzu demo şablonla başlamaz. | VPS deploy sonrası ürün ekle, refresh, masada kontrol et, ürün sil, refresh testi yapılmalı. |

| Finding | Status | Root cause | Files changed | Fix applied | Remaining QA |
| --- | --- | --- | --- | --- | --- |
| Korumalı ekran login doğrulanmadan kısa süre görünebiliyordu | WORKING | Client provider, `/api/auth/me` tamamlanmadan children render ediyordu. React Query önbelleğinde eski başarılı sonuç varsa refetch sırasında da kısa görünüm oluşabiliyordu. | `components/providers/app-runtime-provider.tsx`, `lib/query/auth.ts` | Korumalı ekran auth doğrulaması, refetch ve runtime hazırlığı tamamlanana kadar kapalı tutulur. Auth sorgusu her mount sırasında yeniden doğrulanır. | VPS deploy sonrası cookie silinmiş ve süresi dolmuş cookie senaryoları tarayıcıda doğrulanmalı. |
| İptal edilmiş oturum geç çıkış yapıyordu | WORKING | Recovery modunda 90 saniyelik auth revocation kontrolü tamamen devre dışıydı; manuel çıkış client temizliği için ağ yanıtlarını bekleyebiliyordu. | `components/providers/app-runtime-provider.tsx`, `lib/client/isolation.ts`, `lib/client/secure-logout.ts`, `scripts/verify-product-recovery.mjs` | Hafif auth kontrolü recovery modunda açık tutulur, 30 saniyede bir ve focus/visibility dönüşünde çalışır. Client oturumu ağ temizliğinden önce sıfırlanır; server logout bekleme süresi üst sınırı 1.5 saniyedir. | Çok sekmeli tarayıcıda çıkış senkronizasyonu canlıda tekrar doğrulanmalı. |
| Yeni tenant refresh sonrasında eski masa ürünlerini görebiliyordu | WORKING | Oturumsuz client varsayılanı demo tenant `ABN-48291` idi. Authoritative masa sipariş belleği tenant kimliği taşımadığı için tenant geçişinde önceki snapshot yeniden kullanılabiliyordu. | `lib/session-store.ts`, `lib/client/runtime-state.ts`, `lib/client/authoritative-table-orders.ts`, `app/products/page.tsx`, `lib/sale-product-catalog.ts`, `lib/raw-ingredient-store.ts`, `lib/recipe-pool.ts`, `lib/integration-store.ts` | Oturumsuz varsayılan tenant `anonymous` oldu. Runtime ve masa sipariş snapshot'ları tenant değişince temizlenir. Eski tenant için başlamış API yanıtı tenant değişmişse discard edilir. Ürün, hammadde, reçete ve entegrasyon cache fallback'leri de demo tenant yerine `anonymous` kullanır. | Yeni tenant ile login, masa ekranı refresh ve eski tenanttan yeni tenant geçişi canlı DB üzerinde doğrulanmalı. |

### REFRESH SESSION IDENTITY HARDENING FOLLOW-UP

| Bulgu | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Manuel QA notu |
| --- | --- | --- | --- | --- | --- |
| Refresh sırasında demo abone numarası geri görünebiliyordu | WORKING | Aynı isimli `adisyum_session` cookie'si domain'li ve host-only varyantlarda birlikte kalabildiği için login sonrası refresh eski geçerli tenant tokenını yeniden seçebiliyordu. | `lib/session.ts`, `scripts/verify-product-recovery.mjs` | Yeni session cookie yazılmadan önce eski cookie varyantları temizlenir; ardından yalnız güncel tenant tokenı yazılır. | Deploy sonrası mevcut tarayıcıda bir kez çıkış yapıp yeni tenant ile login olunmalı; refresh sonrası üst bardaki Abone kodu sabit kalmalı. |
| Login sonrası eklenen masa ve ürün cache'i kaybolabiliyordu | WORKING | Login temiz başlangıç fonksiyonu legacy cache'lerle birlikte giriş yapılan tenant'ın kendi scoped ürün ve masa cache anahtarlarını da siliyordu. | `lib/tenant-clean-start.ts`, `scripts/verify-product-recovery.mjs` | Login temizliği yalnız legacy global ve `anonymous` cache anahtarlarını kaldırır; gerçek tenant'ın scoped cache'i korunur. | Yeni tenantta ürün ve masa ekle, refresh yap, tekrar login ol, yeniden refresh yap testi canlıda tekrarlanmalı. |
| Bootstrap sırasında korumalı ekran boş kalıyordu | WORKING | Auth ve runtime bootstrap kapısı korumalı rotada `null` döndürüyordu; kullanıcı bekleme durumunu ayırt edemiyordu. | `components/providers/app-runtime-provider.tsx`, `scripts/verify-product-recovery.mjs` | Korumalı ekranlar auth ve tenant snapshot bootstrap tamamlanana kadar deterministik `Oturum doğrulanıyor...` görünümü gösterir. | Yavaş bağlantıda refresh sırasında demo ürün kartı veya yanlış Abone kodu görünmemeli. |

### TENANT REFRESH PERSISTENCE SECOND PASS

| Bulgu | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Manuel QA notu |
| --- | --- | --- | --- | --- | --- |
| Masa ekleme ve silme refresh sonrasında geri alınabiliyordu | WORKING | Masa düzeni yalnız gecikmeli runtime snapshot isteğine yazılıyordu. Kullanıcı hızlı refresh yaptığında POST tamamlanmadan sayfa kapanabiliyor ve son masa düzeni kayboluyordu. | `lib/table-layout-store.ts`, `lib/tenant-clean-start.ts`, `scripts/verify-product-recovery.mjs` | Masa düzeni runtime snapshot ile birlikte anında tenant-scoped local cache'e yazılır. Login temizliği yalnız legacy ve `anonymous` masa cache'ini kaldırır. | Yeni tenantta masa ekle, hemen refresh yap; masayı sil, hemen refresh yap. |
| Demo ürün kartları gerçek tenant masa ekranında geri gelebiliyordu | WORKING | Önceki sürümlerden kalan scoped veya runtime ürün cache'i `source: seeded` kayıtlarını gerçek tenantta da kabul edebiliyordu. | `lib/sale-product-catalog.ts`, `scripts/verify-product-recovery.mjs` | Demo kaynaklı ürünler yalnız seed tenant `ABN-48291` için okunur. Gerçek tenantlarda kirlenmiş `source: seeded` kayıtlar hydrate edilmez. | `TNT-*` tenant ile login ol, masa adisyonunu aç ve refresh sonrası demo ürün kartlarının görünmediğini doğrula. |

### TENANT IDENTITY REFRESH CACHE FIX

| Bulgu | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Manuel QA notu |
| --- | --- | --- | --- | --- | --- |
| Sayfa yenilenince önce `ABN-48291`, sonra gerçek yeni abone numarası görünüyordu | WORKING | `AppRuntimeProvider`, React Query eski auth cache sonucunu gösterirken `/api/auth/me` refetch işlemi bitmeden session/runtime hydrate ediyordu. Bu yüzden ilk render demo/önceki tenant kimliğiyle açılıp sonra yeni tenant cevabına dönüyordu. | `components/providers/app-runtime-provider.tsx`, `scripts/verify-product-recovery.mjs`, `FULL_BUSINESS_RECOVERY_MATRIX.md` | Protected route redirect ve runtime hazırlık akışı `isFetching` bitmeden çalışmaz. Session snapshot, runtime scope bootstrap ve tenant identity propagation yalnızca güncel auth cevabı geldikten sonra yapılır. Regresyon kontrolü recovery validation scriptine eklendi. | Yeni tenantla `/app` ve masa adisyonu açıkken refresh yap; üst bardaki abone numarası hiçbir anda `ABN-48291` göstermemeli. |
| Masalarda ürünler, Ürünler modülünde görünmediği halde refresh sonrası geri dönüyordu | WORKING | Masa adisyonu eski açık siparişleri `/api/pos/table-orders` üzerinden authoritative olarak hydrate ediyordu; order item mevcut tenant POS kataloğunda artık yoksa bile satır döndürülüyordu. | `app/api/pos/table-orders/route.ts`, `components/floor-workspace.tsx`, `scripts/verify-product-recovery.mjs`, `FULL_BUSINESS_RECOVERY_MATRIX.md` | Table-orders GET/response payload'ı yalnız güncel tenant POS kataloğunda productId/posKey ile eşleşen satırları döndürür. Tenant kataloğu boşsa authoritative masa payload'ı boş döner. Masa toplamında ayrıca KDV tekrar ekleyen `* 1.1` kaldırıldı. | Yeni tenantta ürün kataloğu boşken masa adisyonunu refresh et; `authoritative-orders-hydrated` tableCount artık eski ürünlerden dolayı dolu gelmemeli. |

### TENANT IDENTITY DRIFT / DEMO FALLBACK ROOT CAUSE FINDINGS

| Bulgu | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Manuel QA notu |
| --- | --- | --- | --- | --- | --- |
| Production source içinde `ABN-48291` demo fallback kapıları kalmıştı | WORKING | Tenant local cache okuyucuları, yalnız demo tenant için eski unscoped localStorage anahtarlarını tekrar kabul ediyordu. Ayrıca legacy SaaS/System Admin store default tenant ve credential seed ediyordu. | `lib/tenant-clean-start.ts`, `lib/table-layout-store.ts`, `lib/sale-product-catalog.ts`, `lib/raw-ingredient-store.ts`, `lib/recipe-pool.ts`, `lib/integration-store.ts`, `app/products/page.tsx`, `lib/saas-store.ts`, `lib/system-admin-store.ts`, `components/release-operations-center.tsx`, `lib/autonomous-operations.ts`, `lib/release-governance.ts`, `lib/disaster-recovery.ts` | Hardcoded demo tenant kaldırıldı. Seed business data sadece explicit `NEXT_PUBLIC_ENABLE_SEED_BUSINESS_DATA=1` ve `NEXT_PUBLIC_SEED_TENANT_ID` ile açılır. Local stores artık sadece tenant-scoped key okur; unscoped legacy key hydrate edilmez. SaaS/System Admin local fallback boş tenant listesiyle başlar. | Yeni tenantla refresh yapıldığında demo abone numarası veya eski unscoped ürün/masa cache'i görünmemeli. |
| Runtime snapshot farklı tenant kimliği taşıyorsa hydrate edilebiliyordu | WORKING | Runtime snapshot değerlerinde tenantId/tenant_id alanı varsa current session tenant ile karşılaştırılmıyordu. | `lib/client/runtime-state.ts` | Tenant runtime snapshot hydrate öncesi `tenantId` / `tenant_id` alanları taranır. Current tenant ile uyuşmayan snapshot reddedilir ve `[tenant-drift] runtime snapshot rejected for tenant mismatch` loglanır. | Canlıda eski snapshot varsa ilk refreshte reddedilmeli; UI doğru tenant auth cevabı gelmeden açılmamalı. |
| Bu hata için ayrı validation yoktu | WORKING | Önceki testler ürün ve runtime davranışını yakalıyordu ama production source içinde demo fallback aramıyordu. | `scripts/verify-tenant-identity-drift.mjs`, `package.json` | `npm run tenant:identity-drift` eklendi. Production source içinde `ABN-48291`, unscoped localStorage fallback, auth/me tenant fallback, runtime tenant mismatch guard ve demo credential seed kontrol ediliyor. | Deploy öncesi mandatory validation listesine eklendi. |
### FINAL DEMO RESIDUE REMOVAL FINDINGS

| Bulgu | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Manuel QA notu |
| --- | --- | --- | --- | --- | --- |
| Deploy script üretim env yoksa demo tenant üretiyordu | WORKING | `reconstruct-vps-runtime.sh`, eksik `.env.production` durumunda `BOOTSTRAP_TENANT_ID` için eski demo kodunu varsayılan yazıyordu. | `deploy/scripts/reconstruct-vps-runtime.sh` | Demo tenant default kaldırıldı. Eksik bootstrap tenant artık validation hatasıdır; üretim deploy gerçek tenant/env olmadan sahte demo kimliğiyle ayağa kalkmaz. | VPS deploy öncesi `.env.production` gerçek değerlerle kontrol edilmeli. |
| Prisma seed production'da demo tenant oluşturabiliyordu | WORKING | `prisma/seed.mjs` tenant id verilmezse eski demo abone kodunu kullanıyor ve demo restoran kaydı açıyordu. | `prisma/seed.mjs` | Seed sadece `ALLOW_DEMO_SEED=1`, production dışı ortam ve explicit `SEED_TENANT_ID` ile çalışır. | Production deploy akışında seed çalıştırılmamalı. |
| KDS local fallback demo bilet ve demo tenant döndürebiliyordu | WORKING | Backend hata alınca KDS route, hardcoded restoran biletlerini `tenant_id: demo` ile döndürüyordu. | `lib/server/kds-local.ts`, `app/api/kds/tickets/route.ts` | KDS local fallback artık tenant-scoped boş liste döndürür; status fallback demo bileti güncellemez. | KDS backend kapalıyken ekranda demo sipariş görünmemeli. |
| Kullanılmayan demo POS config source içinde kalmıştı | WORKING | `lib/demo-pos-config.ts` kullanılmıyordu ama production source taramasında demo ürün/masa/adisyon datası taşıyordu. | `lib/demo-pos-config.ts` | Dosya silindi; demo ürün/masa/adisyon seed kaynağı production source'tan kaldırıldı. | Build sonrası browser chunk içinde demo ürün seed'i olmamalı. |
| Validation demo kalıntılarını toplu yakalamıyordu | WORKING | Mevcut kontroller identity drift ve product recovery odaklıydı; deploy, seed, KDS fallback ve built chunk demo kalıntılarını birlikte denetlemiyordu. | `scripts/verify-demo-purity.mjs`, `package.json` | `npm run demo:purity` eklendi. Production source, built browser chunks, deploy scripts, seed guard, provisioning, auth gate, runtime tenant mismatch ve KDS fallback birlikte kontrol edilir. | Deploy öncesi mandatory validation listesine eklendi. |
| Test/diagnostic dosyalarında eski demo kodu düz metin kalmıştı | WORKING | Bazı test ve doküman örnekleri eski demo tenant kodunu literal taşıyordu, genel taramada kafa karıştırıyordu. | `scripts/verify-tenant-identity-drift.mjs`, `scripts/verify-enterprise-recomposition-phase4.mjs`, `scripts/verify-enterprise-recomposition-phase5.mjs`, `scripts/verify-auth.ts`, `scripts/bootstrap-admin.ts`, `tools/tenant-switch-isolation-test.mjs`, `scripts/verify-canonical-pos-catalog.ts`, `scripts/verify-product-domain-graph.ts`, `apps/desktop/src/renderer/index.html`, `deploy/PRODUCTION_RELEASE_GUIDE.md`, `deploy/ENTERPRISE_DB_MIGRATION_REPORT.md` | Test tenant örnekleri `TNT-*` formatına taşındı veya gerçek env zorunlu hale getirildi. Desktop placeholder da `TNT-...` oldu. | Kullanıcı tarayıcıda refresh sırasında eski demo abone kodunu görmemeli; eski cookie/cache varsa bir kez güvenli çıkış ve tekrar giriş yapılmalı. |
### PRODUCTION DB DEMO RESIDUE FINDINGS

| Severity | Etkilenen tablo/model | Etkilenen tenant | Business risk | Cleanup strategy | Status |
| --- | --- | --- | --- | --- | --- |
| CRITICAL | `tenants`, `subscriptions`, `users`, `sessions` | Eski demo tenant veya explicit seed metadata taşıyan tenant | Demo kullanıcı veya tenant production erişiminde kalabilir. | `npm run db` ile salt-okunur tespit; yalnız kesin legacy demo veya explicit seed tenant için soft delete. | TOOLING READY, PRODUCTION APPLY NOT EXECUTED |
| HIGH | `runtime_states` | Tenant-scoped | Eski snapshot başka tenant ürün, masa veya ödeme state'ini refresh sonrası geri getirebilir. | Embedded `tenantId` mismatch, orphan runtime state, deleted-tenant demo snapshot ve expired volatile key sınıflandırması; yalnız güvenli id listesi prune edilir. | TOOLING READY |
| HIGH | `printers`, `tenant_device_registry` | Tenant-scoped | Demo veya orphan printer mapping yanlış cihaz yönlendirmesi yapabilir. | Orphan demo printer soft deactivate; orphan stale registry revoke; duplicate mapping manuel review. | TOOLING READY |
| HIGH | `orders`, `order_items`, `payments`, `cash_transactions`, `reports` | Tenant-scoped | Finansal geçmişin yanlışlıkla silinmesi müşteri veri kaybı yaratır. | Cleanup script bu tabloları `DO NOT TOUCH` olarak işaretler ve destructive işlem uygulamaz. | GUARDED |
| MEDIUM | `products`, `product_categories`, `stock_items`, `recipes`, `tables`, `table_groups`, `customers`, `cash_registers` | Son 20 non-system tenant | Yeni tenant temiz başlangıç kuralı DB seviyesinde ihlal edilmiş olabilir. | Audit her yeni tenant için sayaç üretir; beklenmeyen kayıtlar manuel incelemeye düşer, otomatik silinmez. | TOOLING READY |
| MEDIUM | Tenant-scoped business tabloları | Orphan tenant id | Tenant kaydı olmayan iş verileri izolasyon ve bakım riski taşır. | Audit schema'daki tenant-scoped tabloları LEFT JOIN ile tarar; sonuçlar manuel review listesine alınır. | TOOLING READY |
| INFO | `scripts/audit-db-demo-residue.mjs`, `scripts/cleanup-db-demo-residue.mjs`, `DB_DEMO_RESIDUE_AUDIT_REPORT.md` | Production DB | Kör cleanup riski vardı. | `npm run db`, dry-run cleanup ve production apply için çift env kilidi eklendi. JSON backup planı zorunlu hale getirildi. | WORKING |

### CRITICAL POS REGRESSION — ORDER SAVE / TABLE STATUS / PAYMENT / PRINTERS

| Bulgu | Durum | Kök neden | Değişen dosyalar | Yapılan fix | Manuel QA notu |
| --- | --- | --- | --- | --- | --- |
| `Kaydet ve yazdır` yazıcı bulunamadığında adisyonu tamamlamadan dönüyordu | WORKING | Yazdırma keşfi ve sipariş kaydı tek handler içinde yazıcıya bağımlıydı. Yazıcı yoksa erken `return` çalışıyor, masa doluluk ve ödeme akışı güvenilir authoritative save cevabı alamıyordu. | `components/order-composer.tsx`, `app/api/pos/table-orders/route.ts` | Tenant-scoped `save_order` API aksiyonu eklendi. İstemci önce DB kaydını tamamlar, authoritative siparişi yeniler ve ardından yazdırmayı dener. Yazıcı yoksa adisyon korunur ve görünür uyarı verilir. | Masaya ürün ekle, Local Agent kapalıyken `Kaydet ve yazdır` seç, masadan çıkıp tekrar gir ve refresh yap. Ürün korunmalı, masa dolu görünmeli, ödeme açılmalı. |
| Runtime katalog kısa süre boşken gerçek masa siparişi görünmez olabiliyordu | WORKING | Hydrate filtresi katalog boşsa doğrudan boş payload dönüyordu. Tenant DB ürünüyle bağlı açık sipariş de katalog rebuild süresince kayboluyordu. | `app/api/pos/table-orders/route.ts`, `scripts/verify-product-recovery.mjs` | Hydrate artık aktif ve silinmemiş aynı-tenant DB ürün kimliklerine güvenerek siparişi korur. Başka tenant, silinmiş ürün ve eşleşmeyen eski snapshot satırları yine filtrelenir. | Masayı kaydet, sayfayı yenile ve katalog endpoint'i gecikse bile siparişin masada kaldığını doğrula. |
| Agent çevrimdışıyken kayıtlı yazıcı eşleşmeleri görünmüyordu | WORKING | Local-agent proxy yalnız son heartbeat cihazının Windows yazıcı listesini dönüyordu; Prisma'daki tenant yazıcı kayıtları agent yoksa kayboluyordu. | `app/api/printers/local-agent/route.ts` | Proxy tenant-scoped `printers` kayıtlarını installed printer listesiyle birleştirir. Agent kapalıysa kayıtlı eşleşmeler görünür kalır; offline tanısı ayrı mesaj ve kodla döner. | Agent kapalıyken kayıtlı yazıcıları gör, ardından agent açıp sistem yazıcılarının birleştiğini kontrol et. |
| Kritik POS akışı için deploy guard yoktu | WORKING | Kaydetme-yazdırma sırası ve tenant-linked hydrate davranışı statik regresyon kontrolünde doğrulanmıyordu. | `scripts/verify-pos-critical-flow.mjs`, `package.json` | `npm run pos:critical-flow` eklendi; save-first sırası, ödeme close aksiyonu, masa doluluk eşlemesi ve yazıcı proxy fallback'i doğrulanır. | Her deploy öncesi zorunlu çalıştırılmalı. |
