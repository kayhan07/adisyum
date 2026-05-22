# Canonical Runtime Topology

Status: production source-of-truth topology.

## Runtime Surfaces

| URL | Owner | Port | Runtime |
| --- | --- | --- | --- |
| `https://adisyum.com` | `adisyum-website` | `3010` | Website Next app under `apps/website`. |
| `https://adisyum.com/app` | `adisyum-root-app` | `3000` | Root Next standalone app. |
| `https://adisyum.com/system-admin` | `adisyum-root-app` | `3000` | Root Next standalone app. |
| `https://adisyum.com/api/*` | `adisyum-root-app` | `3000` | Root Next App Router API routes. |
| `https://adisyum.com/adisyonsistemi` | Redirect only | none | Permanent redirect to `/app`. |

## PM2 Ownership

The only allowed PM2 apps are:

| PM2 app | Purpose | CWD | Script | Required env |
| --- | --- | --- | --- | --- |
| `adisyum-root-app` | Business app, POS, ERP, APIs, system admin | repo root | `.next/standalone/server.js` | `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `SESSION_COOKIE_DOMAIN=.adisyum.com` |
| `adisyum-website` | Marketing website | `apps/website` | `next start -p 3010` | `NODE_ENV=production` |
| `adisyum-worker` | Background/orchestration worker | repo root | `workers/orchestration-worker.ts` via `tsx` | `NODE_ENV=production` |

Forbidden PM2/runtime owners:
- `adisyum-pos-app`
- `adisyum-system-admin`
- duplicate standalone processes
- old `next start` process for root app
- any process listening on port `3020`
- any app that owns `/adisyonsistemi`

## Nginx Ownership

Canonical routing:

```text
/api          -> 127.0.0.1:3000
/api/*        -> 127.0.0.1:3000
/app          -> 127.0.0.1:3000
/app/*        -> 127.0.0.1:3000
/system-admin -> 127.0.0.1:3000
/system-admin/* -> 127.0.0.1:3000
/adisyonsistemi -> 308 /app
/adisyonsistemi/* -> 308 /app
/             -> 127.0.0.1:3010
```

Important location precedence:
- `/api` and `/api/` must be explicit and above `location /`.
- `/adisyonsistemi` redirect blocks must be explicit and above root app regex paths.
- No `/api` location may proxy to `3010`.
- No `/adisyonsistemi` location may proxy to `3000` or `3010`.

## Next Runtime Ownership

Root app owns:
- `/app`
- `/system-admin`
- `/api`
- POS runtime engines
- tenant auth/session APIs
- table order mutation route
- runtime build id route

Website app owns:
- public marketing pages only
- no `/api` namespace
- no POS or admin routes

## Critical API Route

Route:

```text
app/api/pos/table-orders/route.ts
```

Expected unauthenticated response:

```text
HTTP 401
{"ok":false,"error":"Unauthorized","code":"missing_session"}
```

Any `404` for this route means route ownership drift, stale bundle/runtime, proxy drift, or wrong upstream.

## Runtime Proof Endpoint

Route:

```text
/api/runtime-build-id
```

Required fields:
- `buildId`
- `gitCommit`
- `deploymentTime`
- `nodeEnv`
- `port`
- `sessionCookieDomain`

Deploy is not successful until this endpoint reports the expected commit and production environment.

## Browser Runtime Parity Rule

These must hit the same route handler:

```js
fetch('/api/pos/table-orders', { method: 'POST' })
```

```bash
curl -i -X POST https://adisyum.com/api/pos/table-orders
```

If curl returns `401` but browser returns `404`, investigate in this order:
1. stale deployed commit from `/api/runtime-build-id`
2. stale browser JS chunk or Cloudflare cache
3. service worker/cache if any
4. legacy `/adisyonsistemi` bundle still loaded
5. Nginx active config from `nginx -T`
6. PM2 active process and port ownership

