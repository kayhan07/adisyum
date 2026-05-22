# Legacy Runtime Removal Report

Phase 5 removes debt only when canonical ownership already exists. No destructive migration is introduced in Phase 5.

## Safe to remove

- `app/orders/demo/page.tsx`: removed. It was a demo-era route that only redirected to `/orders`; no application reference remains.
- Localhost/default credentials in `lib/server/backend-auth.ts`: removed. Backend proxy integration now requires explicit environment configuration instead of silently falling back to `127.0.0.1:8000`, `demo-bistro`, or local admin credentials.

## Migration required

- `app/api/pos/test/route.ts`: still used by POS settings device diagnostics. It should eventually move under an explicit diagnostics namespace, but removing it now would break printer/device verification flows.
- `deploy/scripts/fix-apache-nginx-production.sh`: old corrective script remains referenced by production docs. Canonical deploy owner is `deploy/scripts/reconstruct-vps-runtime.sh`.
- `deploy/scripts/check-production.sh`: useful as historical smoke check, but not canonical deployment authority.
- `prisma/seed.mjs`: still contains demo tenant defaults and must stay isolated from production deploys.

## Preserve for compatibility

- `app/adisyonsistemi/page.tsx`: retained as a permanent compatibility redirect to `/app`.
- Nginx `/adisyonsistemi` blocks: retained only as `308 /app`, never as runtime ownership.
- Product `legacyKey`: retained as compatibility identity, not runtime authority.

## Critical - do not remove

- `lib/runtime/runtime-api.ts`
- `lib/runtime/table-state-engine.ts`
- `lib/pos-runtime/order-mutations.ts`
- `lib/pos-runtime/runtime-sync-engine.ts`
- `lib/pos-runtime/runtime-persistence-engine.ts`
- `lib/pos-runtime/runtime-event-bus.ts`
- `lib/runtime/runtime-session-engine.ts`
- `lib/runtime/tenant-runtime-context.ts`
- `lib/device-runtime/device-session-registry.ts`

## Gate

`npm run recomposition:phase5-validate` prevents reintroduction of demo route ownership, localhost backend fallbacks, unexpected `adisyonsistemi` references, legacy-prefixed API calls, duplicate runtime event emitters, and PM2/nginx legacy runtime ownership.

