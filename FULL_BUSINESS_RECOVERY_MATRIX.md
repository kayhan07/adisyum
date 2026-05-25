# Full Business Recovery Matrix

Last updated: 2026-05-25

Scope: Adisyum POS/ERP business recovery only. No architecture expansion, no new runtime layer, no communication-platform scope.

## Masalar / Adisyon

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Masa -> adisyon -> urun ekleme | WORKING, live QA required | API/DB | Click, payload, optimistic UI and `/api/pos/table-orders` flow is active. Production must confirm 200 with authenticated session. |
| Urun silme / adet degisimi | WORKING, live QA required | DB persistence | Increment, decrement, return and delete now persist through `/api/pos/table-orders` outside React state updaters, then reconcile authoritative table state. Missing DB rows return controlled errors instead of hidden 500s. |
| Rapid line mutation spam | WORKING, guarded | Race prevention | Same table line now has an in-flight guard, so rapid duplicate quantity/delete clicks do not launch concurrent DB mutations for the same line. |
| Hesap alma / masa kapatma | Pass, live QA required | Ledger/table cleanup | Full payment closes local table state and calls `close_table_payment`. |
| Masa tasima | WORKING, guarded | State cleanup | Missing source/target table now surfaces `[business-flow]` error and UI message. |
| Masa birlestirme | WORKING, guarded | Merge integrity | Missing source/target table now surfaces `[business-flow]` error and UI message. |
| Secili urun aktarimi | WORKING, guarded | Partial transfer | Missing selection panel now surfaces `[business-flow]` error and UI message. |
| KDS sync | PARTIAL, live QA required | Sync visibility | Product insertion must be verified against KDS screen after backend 200. |
| Multi-terminal same table | PARTIAL, live QA required | Reconciliation | Line edits publish tenant order events and return authoritative table state. Requires two-browser live proof for add/delete/quantity/payment. |

## Gunluk Rapor / Kasa

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Gun sonu snapshot | PARTIAL, live QA required | Report duplication | Existing guard blocks open tables before end-of-day. Manual duplicate report test required. |
| Ana kasa aktarimi | PARTIAL, live QA required | Ledger consistency | Cash/account movement helpers are still existing owners. |
| Devir bakiyesi | PARTIAL, live QA required | Balance correctness | Requires live tenant data verification. |

## Urunler

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Kategori ekleme | WORKING | Persistence/cache | Custom categories persist after refresh; empty category is no longer silent. |
| Hammadde ekleme | WORKING, guarded | Product domain | Empty name is no longer silent. POS catalog exclusion remains intentional. |
| Satis urunu ekleme | WORKING, guarded | Catalog visibility | Empty name is no longer silent; catalog refresh must be live verified. |
| Hizli satis urunu | WORKING, guarded | Catalog visibility | Empty quick product name is no longer silent. |
| Recete satiri | WORKING, guarded | Stock deduction | Missing product/ingredient/quantity now shows feedback. |
| Recete havuzu yayinlama | WORKING, guarded | Versioning | Empty recipe publish is no longer silent. |

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

## Silent Failure Cleanup

| Area | Status | Notes |
| --- | --- | --- |
| Business stores | Pass | Persistence catches now log `[business-flow] ... failed`. |
| Products module | Pass | Critical create/category/recipe no-op exits now show safe feedback. |
| Finance module | Pass | Critical create/ledger no-op exits now show safe feedback. |
| Floor module | Pass | Critical move/merge/selected-transfer missing state now logs and shows feedback. |
