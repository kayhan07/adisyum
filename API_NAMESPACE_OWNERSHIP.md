# API Namespace Ownership

Phase 3 establishes `lib/runtime/runtime-api.ts` as the canonical API namespace owner.

## Rules

All runtime-critical browser API calls must use `runtimeFetch` or `buildApiUrl`.

`runtimeFetch` is responsible for:

- root-relative `/api` paths
- rejecting `/app/api` and `/adisyonsistemi/api`
- including credentials by default
- preventing pathname-derived API drift

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

## Transitional Debt

Some feature clients still call `fetch('/api/...')` directly, especially system-admin, media, finance, and template screens. These are not allowed to become runtime ownership paths. They must be migrated incrementally to `runtimeFetch` before Phase 5 legacy removal.
