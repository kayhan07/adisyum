# Legacy Infrastructure Removal Plan

Status: controlled removal plan. Do not remove runtime surfaces before validation proves redirects and canonical ownership are stable.

## Legacy Sources Of Drift

| Legacy item | Current action | Final state |
| --- | --- | --- |
| `/adisyonsistemi` application/login route | Redirect to `/app` | No runtime ownership. |
| `/adisyonsistemi/api/...` URL leakage | Rejected by `lib/runtime/runtime-api.ts` | Impossible API path. |
| path-derived API URLs | Replace with runtime API builder | No pathname-derived API. |
| split app/admin subdomains | deploy script rejects | Not active. |
| port `3020` runtime | deploy script rejects | Not active. |
| stale PM2 apps | reconstruct script validates exact app set | Not active. |
| old standalone outputs | clean deploy must remove/rebuild | Not authoritative. |

## Removal Phases

### Phase A: Redirect And Guard

Completed in source:
- `/adisyonsistemi` page redirects to `/app`.
- Nginx redirects `/adisyonsistemi` and `/adisyonsistemi/*` to `/app`.
- Route audit fails if `/adisyonsistemi` proxies to a runtime.

Validation:

```bash
curl -I https://adisyum.com/adisyonsistemi
```

Expected:

```text
308 /app
```

### Phase B: Client Reference Cleanup

Rules:
- marketing links should target `/app`.
- logout should return to `/app` unless system-admin.
- app shell should not treat `/adisyonsistemi` as allowed runtime root.

Audit:

```bash
rg -n "adisyonsistemi|/adisyonsistemi" app components lib deploy scripts -S
```

Allowed remaining references:
- redirect route implementation.
- Nginx redirect blocks.
- audit script validation.
- explanatory docs.

### Phase C: Deploy Script Enforcement

`deploy/scripts/reconstruct-vps-runtime.sh` must:
- write canonical Nginx config.
- reject `/api` to `3010`.
- reject `/adisyonsistemi` proxy ownership.
- validate public `/api/pos/table-orders`.
- validate public `/adisyonsistemi` redirect.
- validate runtime build identity.

### Phase D: Documentation Cleanup

Update or retire documents that present `/adisyonsistemi` as the primary runtime URL.

Canonical replacement:

```text
/app
```

Do not delete historical incident reports; mark them as historical if needed.

### Phase E: Final Deletion Window

Only after at least one stable production release:
- keep `/adisyonsistemi` as redirect for compatibility.
- do not reintroduce a page or login UI under it.
- monitor for hits and stale clients.

## Forbidden Reintroductions

- Nginx proxy for `/adisyonsistemi`.
- React login page under `/adisyonsistemi`.
- API builder that uses current path as prefix.
- PM2 app or Next runtime for POS separate from `adisyum-root-app`.
- Cloudflare rewrite that maps `/adisyonsistemi` to an alternate origin.

