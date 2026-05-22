# Legacy Environment Debt

No destructive migration is introduced in Phase 5.

## Safe to remove

- Removed server-side fallback values from `lib/server/backend-auth.ts`:
  - `http://127.0.0.1:8000`
  - `demo-bistro`
  - local admin email/password defaults

## Migration required

- `AURELIA_API_URL`
- `AURELIA_TENANT_KEY`
- `AURELIA_BACKEND_EMAIL`
- `AURELIA_BACKEND_PASSWORD`

These are now required for external backend proxy integration. If the integration is not enabled in an environment, calling the proxy should fail explicitly rather than calling a localhost/demo backend.

## Preserve for compatibility

- Desktop/local bridge loopback behavior is preserved only behind `lib/local-agent.ts` and explicit desktop/runtime detection.
- Deployment loopback references such as `127.0.0.1:3000` and `127.0.0.1:3010` are valid infrastructure upstreams, not browser runtime assumptions.

## Critical - do not remove

- `SESSION_COOKIE_DOMAIN`
- `PORT=3000` for `adisyum-root-app`
- `HOSTNAME=0.0.0.0` for standalone root runtime
- canonical production URL ownership for `https://adisyum.com`

## Validation

The Phase 5 validator fails if application code reintroduces unauthorized loopback URL defaults outside the approved local bridge boundary.

