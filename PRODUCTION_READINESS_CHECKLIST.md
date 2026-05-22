# Production Readiness Checklist

No rewrite is introduced in Phase 8.

## Required validation

- `npm run build`
- `npx tsc --noEmit`
- `npm run routes:audit`
- `npm run runtime:audit-production`
- `npm run recomposition:phase1-validate`
- `npm run recomposition:phase2-validate`
- `npm run recomposition:phase3-validate`
- `npm run recomposition:phase4-validate`
- `npm run recomposition:phase5-validate`
- `npm run recomposition:phase6-validate`
- `npm run recomposition:phase7-validate`
- `npm run recomposition:phase8-validate`

## Scale readiness

Every queue must have bounded retries.

Every realtime subscription must scale deterministically.

Every deploy must support rollback safety.

Every tenant operation must be auditable.

Every background operation must have deterministic ownership.

## Production rollout proof

Runtime-build-id must match the deployed commit. PM2 must expose the canonical process set. nginx must route canonical namespaces. POS API route must not return 404.
