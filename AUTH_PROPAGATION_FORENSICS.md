# Auth Propagation Forensics

Phase 3 stabilizes auth propagation without rewriting authentication.

## Verified Rules

`runtimeFetch` includes credentials by default.

Runtime auth refresh uses:

- `runtimeFetch('/api/auth/me')`
- `runtimeFetch('/api/auth/session')`
- `runtimeFetch('/api/runtime/heartbeat')`

Session propagation uses:

- `propagateRuntimeSessionAuth`
- `hydrateRuntimeSessionContext`
- `resolveTenantRuntimeScope`
- `resolveBranchRuntimeScope`

## Failure Interpretation

`401 missing_session` means the API route and deployment are healthy, but no authenticated session cookie was delivered.

`404` on an API route is routing/build/runtime drift, not session failure.

`400` after authentication is request schema or domain validation failure.

## Forensic Checklist

1. Confirm `runtime-build-id` matches the latest commit.
2. Confirm `/api/auth/me` uses same-origin `runtimeFetch`.
3. Confirm `adisyum_session` domain is production-safe.
4. Confirm `runtimeFetch` credentials default has not been removed.
5. Confirm tenant/branch scope comes from `tenant-runtime-context`.
6. Confirm bridge/device identity comes from `device-session-registry`.
