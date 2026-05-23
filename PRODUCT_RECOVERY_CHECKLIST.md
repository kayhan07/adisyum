# Product Recovery Checklist

Adisyum product recovery mode focuses on working restaurant operations before any new architecture work.

## Core Flow

- [ ] Login/session works without redirect recursion.
- [ ] Module navigation opens pages without blank screens.
- [ ] Table screen opens quickly.
- [ ] Adisyon opens for a selected table.
- [ ] Product insertion posts to `/api/pos/table-orders`.
- [ ] Product insertion returns `200` for authenticated users, or `401` only when session is missing.
- [ ] Product insertion never returns `404`.
- [ ] Added products persist after browser refresh.
- [ ] KDS shows submitted order lines.
- [ ] Payment flow opens and completes.
- [ ] Logout returns to stable login/session recovery.
- [ ] Login after logout restores normal runtime.

## Stability Gates

- [ ] No blank dark screen.
- [ ] No hydration storm.
- [ ] No recursive auth retry.
- [ ] No repeated authoritative hydration failure loop.
- [ ] No background reconciliation storm.
- [ ] No duplicate optimistic replay storm.
- [ ] No console flood from runtime polling.

## Temporary Recovery Mode

- Background authoritative table sync is disabled in the POS screen.
- Offline auto-sync on POS mount is disabled.
- App runtime telemetry, heartbeat, printer heartbeat, bridge release polling, and session polling are disabled as render blockers.
- Client-side module redirects based only on localStorage token are disabled; server/session auth owns access.
- Initial table hydration and explicit product mutation remain active.
- Manual/user-triggered product insertion remains authoritative through `/api/pos/table-orders`.
