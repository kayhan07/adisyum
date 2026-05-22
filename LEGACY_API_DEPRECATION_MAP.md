# Legacy API Deprecation Map

No destructive migration is introduced in Phase 5.

## Safe to remove

- No production API endpoint was removed in Phase 5.

## Migration required

- `/api/pos/test`: diagnostics endpoint used by POS settings. It should be renamed or moved only after client call sites move to a diagnostics-owned namespace.
- Direct `/api` fetch debt in non-runtime feature clients remains tracked by Phase 3 and should migrate to `runtimeFetch` gradually.
- External backend proxy APIs depend on explicit `AURELIA_*` environment variables after Phase 5; missing env now fails clearly instead of calling localhost defaults.

## Preserve for compatibility

- `/api/v1/product-mappings/*`: compatibility namespace for product mapping consumers.
- `/api/printers/local-agent/*`: bridge proxy namespace.
- `/api/settings/pos/devices/*`: admin/device settings namespace.

## Critical - do not remove

- `/api/pos/table-orders`
- `/api/auth/session`
- `/api/auth/me`
- `/api/runtime/state/[scope]`
- `/api/runtime/table-state`
- `/api/runtime-build-id`

## Validation

The Phase 5 validator rejects legacy-prefixed API namespaces such as `/adisyonsistemi/api` and `/app/api` outside `runtime-api.ts`, where they are deliberately rejected.

