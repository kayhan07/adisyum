# Adisyum System Stabilization Report

## Current Stabilization Pass

- Scope: POS masa/adisyon product insertion flow.
- Decision applied: removed the alternate "Hızlı Garson Modu" path and normalized product clicks to one canonical add-to-adisyon mutation.
- Runtime/auth/deployment/nginx/PM2 layers were intentionally left untouched.

## Root Cause Area

- The adisyon UI had multiple product insertion paths:
  - fast waiter direct add
  - detailed product card add
  - recent/favorite waiter strip add
  - keyboard repeat add
- The floor screen had a separate waiter-mode toggle and swipe shortcuts on table cards.
- Runtime storage sync could refresh the order map immediately after a local mutation, creating a window where an older persisted snapshot could overwrite the just-added product.

## Fixes Applied

- Removed waiter-mode state, toggles, favorite strip, recent-product storage, mobile waiter layout toggle, and repeat keyboard shortcut.
- Product search and product tiles now use one canonical `addProductToOrder` mutation.
- Added order-flow diagnostics for:
  - selected table
  - active order id
  - add product payload
  - blocked add reason
  - mutation result
  - runtime sync source
  - order persistence
- Added a short local mutation guard so external runtime refreshes do not overwrite a fresh product add before it is persisted.
- Removed table-card swipe shortcuts that were previously tied to waiter-mode behavior.

## Canonical POS Flow

1. Masa seç
2. Adisyon aç
3. Ürün ekle
4. Adisyon güncelle
5. Tahsilat
6. Yazdır

## Remaining Audit Queue

- Masa yönetimi: quick note/move/merge actions still need production UX testing for accidental activation.
- Tahsilat: split payment, account charge, mixed payment, and duplicate-payment guards need full regression tests.
- Yazıcı/mutfak/bar fişi: printer mapping and offline printer fallback need hardware-path validation.
- Stok/reçete: smart stock decrement should be verified against sent quantity, return, and complimentary flows.
- Cari: account charge/payment journal consistency should be verified across refresh and multi-tab use.
- Tenant isolation: runtime storage scope should be tested with tenant switching and branch switching.
- Websocket/runtime sync: current storage polling works, but true multi-client conflict resolution remains an architectural risk.
- Dashboard metrics: should be validated from the same persisted order/payment source after payment completion.

## Production Blockers Found In This Pass

- Fast waiter mode introduced multiple inconsistent order insertion branches.
- Immediate external runtime refresh could race a local add-product mutation.
- Swipe shortcuts could trigger note/payment actions from table cards without entering the canonical adisyon flow.
