# Session Ownership Rules

`lib/runtime/runtime-session-engine.ts` is the canonical owner of runtime session context.

## Responsibilities

The session engine owns:

- `hydrateRuntimeSessionContext`
- `propagateRuntimeSessionAuth`
- bridge authorization through `authorizeBridgeRuntimeSession`
- runtime permission envelope creation through tenant context helpers

UI providers may consume session query results, but must not directly hydrate runtime session stores.

## Propagation

`components/providers/app-runtime-provider.tsx` receives the authenticated session from `/api/auth/me` through `runtimeFetch`, then delegates propagation to `propagateRuntimeSessionAuth`.

The provider may still coordinate React readiness and isolation reset, but the session-store mutation is owned by the runtime session engine.

## Cookie Rules

Client code must not read cookies directly.

Session cookie domain ownership remains server-side in `lib/session.ts`. Runtime diagnostics may expose the configured domain through `/api/runtime-build-id` for deployment verification.
