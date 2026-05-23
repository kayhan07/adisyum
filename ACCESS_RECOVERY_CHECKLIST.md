# Access Recovery Checklist

Use this checklist before testing deeper POS flows.

## Root Access

- [ ] `/app/login` renders without a blank screen.
- [ ] `/system-admin/login` renders without a blank screen.
- [ ] `/app` without app session redirects only to `/app/login`.
- [ ] `/system-admin` without system-admin session redirects only to `/system-admin/login`.
- [ ] App logout redirects to `/app/login`.
- [ ] System-admin logout redirects to `/system-admin/login`.
- [ ] No cross-domain redirects occur.

## Product Access

- [ ] Manual app login succeeds.
- [ ] Module center opens.
- [ ] Dashboard opens.
- [ ] Modules open independently.
- [ ] Masalar opens.
- [ ] Table/adisyon opens.
- [ ] Product insertion reaches `POST /api/pos/table-orders`.
- [ ] KDS opens.

## Failure Conditions

- [ ] No blank dark screen.
- [ ] No recursive redirects.
- [ ] No repeated auth retry spam.
- [ ] No hydration deadlock on login routes.
