# Frontend Runtime Forensics

Product recovery mode keeps the frontend lifecycle boring and deterministic.

## Provider Tree

- `app/layout.tsx`
- `QueryProvider`
- `AppRuntimeProvider`
- Route content

`AppRuntimeProvider` must render children immediately. It must not blank the screen while auth, telemetry, heartbeat, persistence, or realtime systems settle.

## Auth Lifecycle

- Unauthenticated app users enter through `/app/login`.
- Login is manual through `POST /api/auth/login`.
- Login verification is a single `GET /api/auth/me`.
- Successful login hydrates in-memory session state and navigates once to `/app`.
- Invalid sessions redirect once to `/app/login`.
- Logout redirects to `/app/login`.

Disabled during product recovery:

- localStorage auth bootstrap
- silent auto-login
- background auth polling
- route replay based on stored session state

## Router Lifecycle

- `/app/login` is the clean app entry for unauthenticated users.
- `/app` is the module center for authenticated users.
- `/adisyonsistemi` is only a permanent redirect to `/app`.
- Middleware must not create `next=` redirect chains.
- Client components must not recursively redirect modules to `/app`.

## Module Mount Lifecycle

Modules should mount independently from the module center:

- `/floor`
- `/orders`
- `/products`
- `/warehouse`
- `/reports`
- `/settings`
- `/kds`

If a module has local runtime work, that work must fail locally and not freeze the entire app tree.

## Known Recursion Sources

- Auth failure causing repeated `/api/auth/me` polling.
- Background authoritative table sync restarting after 401.
- Offline replay running during bootstrap.
- Legacy `/adisyonsistemi?next=/app` redirect chains.
- Client-side package/auth redirect from `AppShell`.
