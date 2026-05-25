# Full Business Recovery Matrix

Last updated: 2026-05-25

Scope: Adisyum POS/ERP business recovery only. No architecture expansion, no new runtime layer, no communication-platform scope.

## Masalar / Adisyon

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Masa -> adisyon -> urun ekleme | Pass, live QA required | API/DB | Click, payload, optimistic UI and `/api/pos/table-orders` flow is active. Production must confirm 200 with authenticated session. |
| Hesap alma / masa kapatma | Pass, live QA required | Ledger/table cleanup | Full payment closes local table state and calls `close_table_payment`. |
| Masa tasima | Pass, guarded | State cleanup | Missing source/target table now surfaces `[business-flow]` error and UI message. |
| Masa birlestirme | Pass, guarded | Merge integrity | Missing source/target table now surfaces `[business-flow]` error and UI message. |
| Secili urun aktarimi | Pass, guarded | Partial transfer | Missing selection panel now surfaces `[business-flow]` error and UI message. |
| KDS sync | Pending live QA | Sync visibility | Product insertion must be verified against KDS screen after backend 200. |

## Gunluk Rapor / Kasa

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Gun sonu snapshot | Pending live QA | Report duplication | Existing guard blocks open tables before end-of-day. Manual duplicate report test required. |
| Ana kasa aktarimi | Pending live QA | Ledger consistency | Cash/account movement helpers are still existing owners. |
| Devir bakiyesi | Pending live QA | Balance correctness | Requires live tenant data verification. |

## Urunler

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Kategori ekleme | Pass | Persistence/cache | Custom categories persist after refresh; empty category is no longer silent. |
| Hammadde ekleme | Pass, guarded | Product domain | Empty name is no longer silent. POS catalog exclusion remains intentional. |
| Satis urunu ekleme | Pass, guarded | Catalog visibility | Empty name is no longer silent; catalog refresh must be live verified. |
| Hizli satis urunu | Pass, guarded | Catalog visibility | Empty quick product name is no longer silent. |
| Recete satiri | Pass, guarded | Stock deduction | Missing product/ingredient/quantity now shows feedback. |
| Recete havuzu yayinlama | Pass, guarded | Versioning | Empty recipe publish is no longer silent. |

## Cari / Kasa

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Tahsilat | Pass, guarded | Ledger | Missing account or invalid amount now shows feedback. |
| Odeme | Pass, guarded | Ledger | Missing account or invalid amount now shows feedback. |
| Stok/urun karti | Pass, guarded | Product/stock | Empty stock card names are no longer silent. |

## System Admin

| Flow | Code status | Risk class | Notes |
| --- | --- | --- | --- |
| Yeni tenant olusturma | Pass, guarded | Tenant lifecycle | Missing company/admin/password now shows provisioning feedback. |
| Temiz tenant baslangici | Pending live QA | Tenant isolation | Must verify new tenant has no demo/cross-tenant product, stock, cari or kasa data. |
| Sifre degistirme / sure uzatma | Pending live QA | Subscription ownership | Existing screens/routes require manual validation. |

## Silent Failure Cleanup

| Area | Status | Notes |
| --- | --- | --- |
| Business stores | Pass | Persistence catches now log `[business-flow] ... failed`. |
| Products module | Pass | Critical create/category/recipe no-op exits now show safe feedback. |
| Finance module | Pass | Critical create/ledger no-op exits now show safe feedback. |
| Floor module | Pass | Critical move/merge/selected-transfer missing state now logs and shows feedback. |
