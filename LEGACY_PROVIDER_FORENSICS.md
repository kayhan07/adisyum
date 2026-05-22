# Legacy Provider Forensics

No destructive migration is introduced in Phase 5.

## Safe to remove

- No provider was removed in Phase 5. Provider removal requires render-tree dependency proof.

## Migration required

- Remaining UI-local persistence must stay limited to non-tenant UI preferences or explicit runtime-provider ownership.
- Feature clients with direct `/api` calls remain Phase 3 debt and should migrate through `runtimeFetch`.

## Preserve for compatibility

- `components/providers/app-runtime-provider.tsx`: canonical runtime consumer/provider bridge.
- Theme localStorage usage: non-tenant UI preference only.

## Critical - do not remove

- `AppRuntimeProvider`
- runtime session propagation through `runtime-session-engine`
- tenant scope resolution through `tenant-runtime-context`
- device identity resolution through `device-session-registry`

## Validation

The Phase 5 validator rejects runtime event emissions from UI/provider code outside canonical runtime event owners and rejects direct browser runtime persistence writes outside approved non-tenant preference/provider files.

