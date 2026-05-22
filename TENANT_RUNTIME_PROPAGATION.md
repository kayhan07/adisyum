# Tenant Runtime Propagation

`lib/runtime/tenant-runtime-context.ts` is the canonical tenant and branch scope authority.

## Responsibilities

The tenant runtime context owns:

- tenant identity projection
- branch identity projection
- runtime tenant scope
- branch mode resolution
- permission envelope construction

## Runtime Flow

1. Auth query fetches the current session through `runtimeFetch('/api/auth/me')`.
2. `runtime-session-engine` receives the session payload.
3. `tenant-runtime-context` resolves tenant and branch scope.
4. Runtime engines consume the resolved scope.

## Hard Rules

Runtime core files must not contain hardcoded tenant ids, branch ids, localhost tenant fallbacks, or demo tenant assumptions.

`lib/session-store.ts` still contains unauthenticated demo defaults for UI fallback state. These defaults are not runtime tenant authority and must not be used as authenticated ownership.
