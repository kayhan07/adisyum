# Auth Boundary Forensics

Adisyum has two separate browser auth domains.

## App Auth Domain

- Owns restaurant operation routes.
- Entry route: `/app/login`
- Authenticated module center: `/app`
- Unauthenticated app requests redirect only to `/app/login`.
- Logout from app routes redirects only to `/app/login`.
- Login endpoint: `POST /api/auth/login`

App domain routes include POS, masalar, adisyon, KDS, stock, recipe, payment, reports, products, and settings.

## System Admin Auth Domain

- Owns platform management routes.
- Entry route: `/system-admin/login`
- Authenticated control center: `/system-admin`
- Unauthenticated system-admin requests redirect only to `/system-admin/login`.
- Logout from system-admin routes redirects only to `/system-admin/login`.
- Login endpoint: `POST /api/auth/system-admin`

System-admin requires a `system` tenant session with `super_admin` role.

## Forbidden Redirects

- `/system-admin/*` must never redirect to `/app/login`.
- `/app/*` must never redirect to `/system-admin/login`.
- Invalid system-admin sessions must stay inside the system-admin auth domain.
- Invalid app sessions must stay inside the app auth domain.

## Middleware Ownership

The middleware owns browser route auth redirects:

- `/app/login` redirects authenticated app sessions to `/app`.
- `/system-admin/login` redirects authenticated system-admin sessions to `/system-admin`.
- `/api/*` returns JSON auth errors instead of browser redirects.

The login pages own manual login submission only. They must not restore auth from localStorage or sessionStorage.
