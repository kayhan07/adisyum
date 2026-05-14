# Adisyum Isolated Domain Routing Checklist

## Target Topology

- `adisyum.com` and `www.adisyum.com` -> marketing website runtime (`127.0.0.1:3010`)
- `app.adisyum.com` -> POS SaaS runtime (`127.0.0.1:3000`)
- `admin.adisyum.com` -> system-admin runtime (`127.0.0.1:3020`)

Nginx vhosts:

- `deploy/nginx/adisyum.conf` (website)
- `deploy/nginx/app.conf` (POS app + websocket-safe proxy)
- `deploy/nginx/admin.conf` (admin)

PM2 isolated process file:

- `ecosystem.isolated.config.cjs`

## Cloudflare / DNS

Create these DNS records:

- Type: `A`, Name: `@`, Content: `<VPS_PUBLIC_IP>`, Proxy: On (orange cloud)
- Type: `CNAME`, Name: `www`, Content: `adisyum.com`, Proxy: On
- Type: `CNAME`, Name: `app`, Content: `adisyum.com`, Proxy: On
- Type: `CNAME`, Name: `admin`, Content: `adisyum.com`, Proxy: On

Cloudflare SSL mode:

- `SSL/TLS -> Overview -> Full (strict)`
- Enable `Always Use HTTPS`

## SSL Certificate Coverage

Use one origin certificate that includes:

- `adisyum.com`
- `*.adisyum.com`

Expected files on VPS:

- `/etc/ssl/cloudflare/origin.pem`
- `/etc/ssl/cloudflare/origin.key`

## Deploy Steps (Production)

1. Build applications:
   - POS/Admin app: `npm run build`
   - Website app: `cd apps/website ; npm run build`
2. Start isolated PM2 processes:
   - `pm2 start ecosystem.isolated.config.cjs --env production`
3. Install Nginx vhosts:
   - Copy `adisyum.conf`, `app.conf`, `admin.conf` to `/etc/nginx/sites-available/`
   - Enable with symlinks into `/etc/nginx/sites-enabled/`
   - Ensure `websocket-map.conf` is loaded in `nginx.conf` `http` block
4. Validate Nginx config:
   - `sudo nginx -t`
   - `sudo systemctl reload nginx`

## Websocket / Realtime Health

`app.conf` forwards upgrade headers:

- `Upgrade $http_upgrade`
- `Connection $connection_upgrade`

and uses long proxy timeouts for realtime streams.

Verification commands:

- `curl -I https://app.adisyum.com`
- `curl -I https://adisyum.com`
- `curl -I https://admin.adisyum.com`

From browser DevTools on `app.adisyum.com`, confirm websocket requests return `101 Switching Protocols` where applicable.

## Runtime Isolation Checks

- `pm2 ls` shows separate process names:
  - `adisyum-website`
  - `adisyum-pos-app`
  - `adisyum-system-admin`
- No vhost points to the wrong port
- Website runtime has no dependency on POS runtime
- `adisyum.com` traffic never proxies to port `3000`

## Rollback Plan

If needed, rollback by restoring previous Nginx vhosts and PM2 config:

1. `pm2 delete all`
2. `pm2 start ecosystem.config.cjs --env production`
3. Restore previous `/etc/nginx/sites-enabled/*`
4. `sudo nginx -t ; sudo systemctl reload nginx`
