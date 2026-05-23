# Product Runtime QA

This checklist is the manual product recovery gate. It tracks only the working restaurant flow.

## Manual Flow

- [ ] Login works and lands on the module center without a blank screen.
- [ ] Dashboard/module center opens without hydration stalls.
- [ ] Masalar opens from the module center.
- [ ] A table opens and the adisyon surface renders.
- [ ] Add 3 products to the table.
- [ ] Network shows `POST /api/pos/table-orders` with status `200` for an authenticated session.
- [ ] Network never shows `404` for `POST /api/pos/table-orders`.
- [ ] If the session is missing, `POST /api/pos/table-orders` returns `401` once and the UI redirects to login/session recovery without retry storms.
- [ ] Browser refresh preserves the table order state.
- [ ] KDS sees the order without aggressive polling or render storms.
- [ ] Payment modal opens for the active table.
- [ ] Logout works.
- [ ] Login again works.
- [ ] Console has no repeated hydration failure spam.
- [ ] Console has no recursive auth retry spam.
- [ ] UI never enters a blank dark screen during the flow.

## Recovery Rules

- Product recovery favors stable product behavior over advanced runtime behavior.
- Background authoritative sync stays disabled until the core POS flow is stable.
- Offline auto-replay stays disabled until the core POS flow is stable.
- KDS fallback polling is bounded and secondary to realtime updates.
- `/adisyonsistemi` is only a permanent redirect to `/app`.
- Runtime API calls must use root `/api/*` paths with credentials included.
