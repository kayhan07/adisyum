# Legacy Route Removal Map

No destructive migration is introduced in Phase 5.

## Safe to remove

- `/orders/demo`: removed. Replacement ownership is `/orders`.

## Migration required

- `/api/pos/test`: still used by `components/settings/pos-settings-client.tsx` for device connection and print diagnostics. Future target is an admin/diagnostics namespace.
- `/orders/demo` bookmarks will now receive normal 404 behavior if called directly. No canonical app navigation points to it.

## Preserve for compatibility

- `/adisyonsistemi`: preserved only as redirect to `/app`.
- `/`: canonical marketing/root routing remains controlled by infrastructure.
- `/app`: canonical application runtime.
- `/system-admin`: admin routes inside the same root runtime.
- `/api/*`: canonical API namespace inside root runtime.

## Critical - do not remove

- `/api/pos/table-orders`
- `/api/runtime-build-id`
- `/api/runtime/pos-catalog`
- `/api/runtime/table-state`
- `/api/auth/*`

## Validation

The Phase 5 validator fails if `app/orders/demo/page.tsx` returns, if `/adisyonsistemi` becomes runtime-owned, or if application code references `adisyonsistemi` outside the compatibility redirect/API guard.

