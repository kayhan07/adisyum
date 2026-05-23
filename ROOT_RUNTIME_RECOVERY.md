# Root Runtime Recovery

This document tracks the minimum stable root lifecycle. It does not introduce new architecture.

## Root Provider Tree

- `app/layout.tsx`
- `QueryProvider`
- `AppRuntimeProvider`
- Route content

`AppRuntimeProvider` must not block login routes. The auth entry routes are:

- `/app/login`
- `/system-admin/login`

On those routes, the provider disables the auth session query and renders children immediately.

## Root Auth Flow

App domain:

1. User opens `/app/login`.
2. Manual login posts to `/api/auth/login`.
3. Login verifies with one `/api/auth/me` request.
4. Success navigates to `/app`.

System-admin domain:

1. User opens `/system-admin/login`.
2. Manual login posts to `/api/auth/system-admin`.
3. Success navigates to `/system-admin`.

## Middleware Ownership

- Unauthenticated app routes redirect to `/app/login`.
- Unauthenticated system-admin routes redirect to `/system-admin/login`.
- API routes return JSON auth errors instead of browser redirects.
- `/adisyonsistemi` remains only a permanent redirect to `/app`.

## Known Recursion Risks

- Login pages waiting on global auth bootstrap.
- Auth query causing a 401 runtime lock before login can render.
- Logout returning to a protected route instead of a login route.
- Cross-domain redirects between `/app/*` and `/system-admin/*`.
- Middleware preserving stale `next=` query strings.
