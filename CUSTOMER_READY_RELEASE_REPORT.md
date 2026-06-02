# Customer Ready Release Report

Generated for the pre-customer production hardening pass.

## Release Scope

- Target commit: `ef86324` or newer.
- Scope: deploy safety, migration readiness, POS backbone, payment/cari reconciliation, tenant isolation, demo purity, printer failure tolerance, new tenant clean state, company/topbar readiness.
- No POS runtime rewrite, auth rewrite, tenant architecture change, landing page change, or unrelated voice/telephony change was performed.

## Status Summary

| Area | Status | Evidence | Remaining Risk |
| --- | --- | --- | --- |
| Deploy commit | PARTIAL | Local `main` contains the cari ledger commit and release guard. VPS SSH was blocked by password/publickey auth, so live commit could not be verified by Codex. | VPS operator must verify `/api/runtime-build-id` after deploy. |
| Migration status | PARTIAL | Prisma schema validates locally and migration `20260602000100_current_account_movement_ledger` exists. | Production DB backup and `npx prisma migrate deploy` must be run on VPS before app restart. |
| POS backbone | WORKING | `pos:backbone` and `pos:critical-flow` guard order save, print failure tolerance, payment API, tenant-linked hydrate, and VAT-included pricing. | Live browser QA is still required on a real tenant. |
| Payment/cari | WORKING | `finance:reconciliation` guards idempotent cari ledger, POS account/mixed payment, cash separation, duplicate prevention, and UI API wiring. | Production DB migration must be applied before testing cari movement persistence. |
| Tenant isolation | WORKING | `tenant:identity-drift`, `tenant:access-policy`, and `demo:purity` guard stale auth, foreign runtime snapshots, demo tenant residue, and access policy. | Existing production DB residue must be reviewed with read-only DB audit output. |
| Demo purity | WORKING | `demo:purity` checks source and built chunks for legacy demo tenant and direct localhost bridge URLs. | Browser cache may require one clean logout/login after deploy. |
| Printer behavior | WORKING | POS backbone guard requires order save before printer discovery and registered printers fallback while agent is offline. | Windows device QA with real printers is required. |
| New tenant clean state | WORKING | `demo:purity`, `tenant:identity-drift`, and DB residue audit tooling protect against default business seed and tenant mismatch hydrate. | Confirm manually with a new tenant after deploy. |
| Company/topbar | PARTIAL | Existing guards protect auth/runtime identity drift. | Manual UI check required for company profile persistence and single logout button. |

## Mandatory VPS Deploy Order

1. `cd /root/adisyum`
2. Verify git state and target commit.
3. Take a production DB backup with `pg_dump`.
4. `git pull origin main`
5. `npm install`
6. `npx prisma generate`
7. `npx prisma migrate deploy`
8. Run validation scripts.
9. `npm run build`
10. `APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh`
11. `pm2 save`
12. Verify `/api/runtime-build-id` locally and through `https://adisyum.com`.

## Manual QA Checklist

- Create a clean tenant and verify products, tables, cari, cash, printers, snapshots, orders, and payments are empty.
- Add a 100 TL product, add quantity 10 to a table, save/print, leave and re-enter the table, then refresh. Total must remain 1000 TL.
- Take partial payments: 400 TL cash, refresh, 300 TL card, refresh, 300 TL cari. Paid total must be 1000 TL and table must close.
- Verify cari debt is 300 TL, take 100 TL cash collection, refresh, and confirm cari balance is 200 TL while cash increases only by 100 TL.
- Switch between two tenants in the same browser and confirm products, tables, payments, cari, reports, printers, and runtime snapshots do not leak.
- Confirm `ABN-48291` never appears during refresh.
- Test Local Agent offline: order save must still persist and printer diagnostic must be visible.
