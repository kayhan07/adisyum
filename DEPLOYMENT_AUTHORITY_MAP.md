# Deployment Authority Map

Status: source-of-truth for production deployment ownership.

## Canonical Authority Chain

```text
Git commit
-> production build
-> Next standalone output
-> PM2 process ownership
-> Nginx upstream ownership
-> Cloudflare/public URL
-> runtime-build-id proof
```

Deployment is not successful until every layer points to the same commit and runtime topology.

## Source Files

| Concern | Source file |
| --- | --- |
| PM2 apps | `ecosystem.config.cjs` |
| Nginx canonical config | `deploy/nginx/adisyum.conf` |
| VPS reconstruction | `deploy/scripts/reconstruct-vps-runtime.sh` |
| Route/build artifact audit | `scripts/audit-next-routes.mjs` |
| Runtime topology audit | `scripts/audit-production-runtime.mjs` |
| Live deploy verification | `scripts/verify-deploy-runtime.mjs` |
| Runtime proof endpoint | `app/api/runtime-build-id/route.ts` |

## Deploy Command

Run on the VPS:

```bash
cd /root/adisyum
git pull
npm run build
APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/reconstruct-vps-runtime.sh
```

## Required PM2 State

Allowed apps:

```text
adisyum-root-app
adisyum-website
adisyum-worker
```

Required root app:

```text
cwd: /root/adisyum
script: .next/standalone/server.js
PORT=3000
HOSTNAME=0.0.0.0
NODE_ENV=production
SESSION_COOKIE_DOMAIN=.adisyum.com
```

Required website app:

```text
cwd: /root/adisyum/apps/website
port: 3010
```

## Required Nginx State

`nginx -T` must prove:
- no `app.adisyum.com` or `admin.adisyum.com` server blocks.
- no upstream to `127.0.0.1:3020`.
- exact `/api` and prefix `/api/` proxy only to `127.0.0.1:3000`.
- `/app` and `/system-admin` proxy only to `127.0.0.1:3000`.
- `/adisyonsistemi` returns `308 /app`.
- root `location /` proxies to `127.0.0.1:3010`.

## Required Build Artifacts

The following must exist after build:

```text
.next/BUILD_ID
.next/standalone/server.js
.next/server/app/api/pos/table-orders/route.js
.next/standalone/.next/server/app/api/pos/table-orders/route.js
.next/server/app-paths-manifest.json
.next/server/middleware-manifest.json
```

## Live Verification

Run after every deploy:

```bash
curl -i -X POST https://adisyum.com/api/pos/table-orders
curl -I https://adisyum.com/adisyonsistemi
curl https://adisyum.com/api/runtime-build-id
```

Expected:

```text
/api/pos/table-orders -> 401 missing_session without login, never 404
/adisyonsistemi -> 308 /app
/api/runtime-build-id -> current git commit, production env, port 3000
```

## Drift Failure Conditions

Fail deployment if:
- live `gitCommit` does not match expected commit.
- live `BUILD_ID` does not match built `.next/BUILD_ID`.
- PM2 contains unexpected app names.
- root app is not standalone.
- root app does not expose port `3000`.
- Nginx routes `/api` to website runtime.
- `/adisyonsistemi` returns a rendered app page instead of redirect.
- public table-orders route returns `404`.

## Cloudflare Rule

Cloudflare can sit in front of the origin, but it must not become a runtime owner.

During incidents:
- purge cache for app assets and HTML.
- disable aggressive caching temporarily.
- verify origin route behavior with Nginx logs and `curl`.
- use `/api/runtime-build-id` as source of truth for live code.

