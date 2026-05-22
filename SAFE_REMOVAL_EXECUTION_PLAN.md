# Safe Removal Execution Plan

No destructive migration is introduced in Phase 5.

## Safe to remove

Completed in Phase 5:

- Remove `/orders/demo` redirect route because canonical replacement `/orders` exists and there are no internal references.
- Remove localhost/demo backend proxy fallbacks because explicit environment ownership exists.

## Migration required

Next candidates require staged migration:

- Move `/api/pos/test` to diagnostics namespace after client call sites are migrated.
- Replace old deployment scripts in docs with `reconstruct-vps-runtime.sh`.
- Remove demo seed defaults only after bootstrap/provisioning flows use explicit tenant fixtures.
- Migrate non-runtime feature direct `/api` calls to `runtimeFetch`.

## Preserve for compatibility

- `/adisyonsistemi -> /app` redirect until external traffic drains.
- Product `legacyKey` until historical product identity migration is proven complete.
- Desktop/local bridge loopback behavior behind explicit runtime detection.

## Critical - do not remove

- canonical runtime engines;
- canonical PM2/nginx topology;
- tenant and branch ownership primitives;
- POS table-orders mutation route;
- runtime-build-id verification.

## Rollback Path

- Restore `app/orders/demo/page.tsx` as a redirect to `/orders` if external monitoring shows meaningful traffic.
- Restore backend proxy environment defaults only in a local development fixture, never in production runtime code.
- Revert Phase 5 commit if validation gates fail in production.

