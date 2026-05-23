# Business Flow Recovery Matrix

Adisyum product recovery mode tracks working restaurant flows only. No new runtime ownership or governance work belongs here.

| Flow | Status | Current recovery check |
| --- | --- | --- |
| Login/session | Partial | Login must clear stale auth runtime lock before app mutations. |
| Module navigation | Partial | Modules must open without recursive auth/runtime bootstrap. |
| Masalar open | Partial | Table list opens and selected table id must resolve to an active table. |
| Masa/adisyon render | Partial | Adisyon must render product grid and active order panel. |
| Product click | Under recovery | Click now logs `[adisyon-flow] product click received`; no silent guard exit is allowed. |
| Product mutation | Under recovery | Only `POST /api/pos/table-orders` should be required for add-product commit. |
| Runtime tenant persistence | Disabled for add-product recovery | `/api/runtime/state/tenant` must not block product insertion or retry-loop the UI. |
| Payment flow | Not yet live-verified | Verify after product insertion is stable. |
| Masa move/merge | Not yet live-verified | Verify after product insertion is stable. |
| KDS sync | Not yet live-verified | Verify after table order mutation returns 200. |
| Products/catalog | Partial | POS catalog hydration route is registered and API drift guard allows it. |
| Cari/kasa/gun sonu | Not yet live-verified | Audit after POS product insertion is working. |

## Product Add Success Proof

Required live proof after deploy:

- Product tile click logs `[adisyon-flow] product click received`.
- Network shows `POST /api/pos/table-orders`.
- Response is `200` for authenticated session.
- Product line appears in the active adisyon.
- `/api/runtime/state/tenant` does not create retry/render floods.
