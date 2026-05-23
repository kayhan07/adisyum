# Full Business Recovery Matrix

Adisyum is in product recovery mode. This matrix tracks only working restaurant ERP/POS flows. It is not an architecture roadmap.

## Masalar / Adisyon

| Flow | Status | Current validation | Recovery notes |
| --- | --- | --- | --- |
| Urun ekleme | Partial | UI click and payload dispatch recovered; `/api/pos/table-orders` route exists; catalog miss fallback added | Needs live login proof: POST returns 200 and line renders in adisyon |
| Hesap alma | Under audit | Client payment journal and cari charge write paths now log failures | Needs live proof: full payment empties table, journal entry appears |
| Masa aktarma | Under audit | Local table state transfer now logs block/commit | Needs live proof: source clears, target receives lines/totals |
| Masa birlestirme | Under audit | Local table merge now logs block/commit | Needs live proof: merged line list/totals are correct |
| Secili urun aktarma | Under audit | Uses merge selection path | Needs live proof: partial selected lines move without orphan lines |
| KDS senkron | Partial | KDS fetch/update has fallback errors; table order route emits KDS records server-side | Needs live proof: product add appears on KDS once |

## Gunluk Rapor / Kasa

| Flow | Status | Current validation | Recovery notes |
| --- | --- | --- | --- |
| Gun sonu | Not yet live-verified | Daily cash/payment journal stores audited | Need exact UI/API path live QA |
| Ana kasa aktarimi | Not yet live-verified | Treasury/finance stores identified | Need movement proof in kasa panel |
| Devir islemi | Not yet live-verified | Daily cash movement storage logs failures | Need balance carryover proof |
| Duplicate rapor kontrolu | Not yet live-verified | No code change yet | Need live duplicate submission test |

## Urunler

| Flow | Status | Current validation | Recovery notes |
| --- | --- | --- | --- |
| Hammadde ekleme | Not yet live-verified | Product/raw ingredient paths identified | Need create stock + tenant ownership proof |
| Satis urunu ekleme | Under audit | Sale product storage now logs load/save failures | Need product create -> POS catalog visible proof |
| Kategori ekleme | Not yet live-verified | Template/category and product category paths identified | Need category create + POS filter proof |
| Recete sistemi | Not yet live-verified | Recipe template/runtime paths identified | Need recipe line + stock deduction proof |
| POS catalog refresh | Partial | `/api/runtime/pos-catalog` allowed; table-orders has payload recovery | Need live product create then adisyon visibility proof |

## Cari / Kasa

| Flow | Status | Current validation | Recovery notes |
| --- | --- | --- | --- |
| Cari kayitlari | Under audit | Account store now logs load/save failures | Need create customer/supplier proof |
| Tahsilat | Under audit | Finance transaction store now logs load/save failures | Need balance decrement + kasa movement proof |
| Odeme | Under audit | Finance transaction store now logs load/save failures | Need balance increment + kasa movement proof |
| Kasa hareketleri | Under audit | Daily cash/payment journal stores now log failures | Need ledger movement proof |
| Tenant kasa izolasyonu | Not yet live-verified | Runtime storage scope is tenant-scoped | Need two-tenant browser/API proof |

## System Admin

| Flow | Status | Current validation | Recovery notes |
| --- | --- | --- | --- |
| Yeni abone olusturma | Partial | `/api/system-admin/tenants` provisions through queued job and logs failures | Need live tenant job success proof |
| Temiz tenant baslangici | Not yet live-verified | Provisioning code identified | Need verify products/stock/cari/kasa empty unless template imported |
| Abone sifre degistirme | Not yet live-verified | Auth/session endpoints identified | Need exact UI/API path proof |
| Ek sure tanimlama | Not yet live-verified | Tenant expiry fields identified | Need update expiry proof |
| Kullanim tarihi degistirme | Not yet live-verified | Tenant expiry fields identified | Need manual expiry update proof |

## Silent Failure Policy Applied In This Pass

- `components/order-composer.tsx`: payment open/complete, send order, printer fallback, table move, table merge now emit business-flow logs and user feedback for blocked states.
- `lib/account-store.ts`: account load/save failures now log.
- `lib/finance-runtime-store.ts`: invoice and account transaction load/save failures now log.
- `lib/payment-journal-store.ts`: payment journal load/save failures now log.
- `lib/daily-cash-store.ts`: daily cash movement load/save failures now log.
- `lib/sale-product-catalog.ts`: sale product load/save failures now log.

## Required Live QA

1. Login.
2. Open Masalar.
3. Open a table.
4. Add 3 products.
5. Confirm Network: `POST /api/pos/table-orders` returns 200.
6. Confirm products render in adisyon.
7. Send order and verify KDS ticket appears once.
8. Take full payment and verify table clears.
9. Create category, sale product, raw material, and recipe.
10. Verify created sale product appears in POS catalog.
11. Create cari account, collection, payment, and kasa movement.
12. Run end-of-day once, then verify duplicate action is prevented.
13. Create new tenant from system-admin and verify clean business data.
