# API Namespace Ownership

Phase 3 establishes `lib/runtime/runtime-api.ts` as the canonical API namespace owner.

## Rules

All runtime-critical browser API calls must use `runtimeFetch` or `buildApiUrl`.

`runtimeFetch` is responsible for:

- root-relative `/api` paths
- rejecting `/app/api` and `/adisyonsistemi/api`
- including credentials by default
- preventing pathname-derived API drift
- returning a safe `400` response for invalid runtime paths instead of throwing through React render

## Current Consolidated Runtime Calls

The following critical client/runtime paths now use the canonical API layer:

- `components/order-composer.tsx`
- `components/providers/app-runtime-provider.tsx`
- `lib/client/runtime-state.ts`
- `lib/client/secure-logout.ts`
- `lib/local-agent.ts`
- `lib/offline-sync-store.ts`
- `lib/query/auth.ts`
- `lib/query/tenant.ts`
- `lib/use-product-mapping-validation.ts`
- `lib/pos-runtime/order-mutations.ts`
- `lib/pos-runtime/runtime-sync-engine.ts`

## Runtime-Safe API Ownership

Valid internal runtime namespaces include:

- `/api/auth/*`
- `/api/pos/table-orders`
- `/api/runtime/pos-catalog`
- `/api/runtime/state/*`
- `/api/runtime/heartbeat`
- `/api/runtime-build-id`
- `/api/kds/*`
- `/api/printers/local-agent*`
- `/api/offline-sync`
- `/api/system-admin/observability/ingest`
- `/api/v1/*`

Blocked legacy namespaces include:

- `/app/api/*`
- `/adisyonsistemi/api/*`
- `/api/app/*`
- `/api/adisyonsistemi/*`

Deprecated runtime paths, including `/api/table-orders` and `/api/legacy/*`, are rejected by the runtime API layer.

The API owner may reject wrong-host absolute URLs. Same-origin absolute URLs are normalized back to root-relative `/api/...` URLs.

Invalid runtime API paths must fail closed inside `runtimeFetch`: log a warning, return a safe `400` response, and let the caller's normal fallback UI continue. Valid POS hydration endpoints, especially `/api/runtime/pos-catalog`, must never trigger a runtime drift crash or recursive safe-mode screen.

## Transitional Debt

Some feature clients still call `fetch('/api/...')` directly, especially system-admin, media, finance, and template screens. These are not allowed to become runtime ownership paths. They must be migrated incrementally to `runtimeFetch` before Phase 5 legacy removal.
