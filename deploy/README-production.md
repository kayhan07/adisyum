# Adisyum Production Setup

This folder contains the Ubuntu VPS production setup for:

- Cloudflare proxy
- Cloudflare Full (Strict) SSL
- Nginx reverse proxy
- WebSocket-compatible proxy headers
- PM2 + Next.js on port 3000
- Cloudflare real visitor IP support
- Nginx WebSocket upgrade map

## 1. Cloudflare Origin Certificate

Cloudflare panel:

`SSL/TLS -> Origin Server -> Create Certificate`

Hostnames:

- `adisyum.com`
- `*.adisyum.com`

Save the generated files on the VPS:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/origin.pem
sudo nano /etc/ssl/cloudflare/origin.key
sudo chmod 644 /etc/ssl/cloudflare/origin.pem
sudo chmod 600 /etc/ssl/cloudflare/origin.key
```

## 2. Copy Project To VPS

Expected app path:

```bash
/var/www/adisyum
```

If your app lives elsewhere, run the setup with `APP_DIR=/path/to/app`.

## 3. Run Setup

From the project root on the VPS:

```bash
sudo APP_DIR=/var/www/adisyum APP_NAME=adisyum APP_USER=$USER DOMAIN=adisyum.com bash deploy/scripts/setup-ubuntu-production.sh
```

## 4. Cloudflare Settings

Cloudflare:

- SSL/TLS -> Overview -> `Full (strict)`
- SSL/TLS -> Edge Certificates -> `Always Use HTTPS` on
- Speed -> Optimization -> `Brotli` on
- Network -> `HTTP/3` on
- Speed -> Optimization -> Auto Minify as preferred
- Security -> Bots -> Bot Fight Mode as preferred

## 5. Test

```bash
pm2 list
sudo nginx -t
curl -I http://adisyum.com
curl -I https://adisyum.com
```

Full production check:

```bash
DOMAIN=adisyum.com APP_NAME=adisyum bash deploy/scripts/check-production.sh
```

If the browser still shows an Apache/AppServ default page after Nginx is active:

```bash
sudo DOMAIN=adisyum.com APP_NAME=adisyum bash deploy/scripts/fix-apache-nginx-production.sh
```

Then purge Cloudflare cache and hard refresh the browser.

The script writes logs under:

```bash
deploy/logs/
```

Expected:

- HTTP redirects to HTTPS
- HTTPS returns `200`, `301`, or `304`
- Browser shows SSL lock
- WebSocket upgrades pass through Nginx

## Isolated multi-domain live cutover

For isolated production routing:

- `adisyum.com` and `www.adisyum.com` -> marketing (`127.0.0.1:3010`)
- `app.adisyum.com` -> POS (`127.0.0.1:3000`)
- `admin.adisyum.com` -> admin (`127.0.0.1:3020`)

Run cutover safely with snapshot + rollback helper:

```bash
sudo APP_DIR=/var/www/adisyum APP_USER=$USER bash deploy/scripts/live-cutover-isolated.sh
```

Run post-cutover validation:

```bash
sudo APP_USER=$USER bash deploy/scripts/validate-go-live-isolated.sh
```

If rollback is needed:

```bash
sudo APP_USER=$USER bash deploy/scripts/rollback-isolated.sh latest
```

Use report template:

`deploy/PRODUCTION_GO_LIVE_REPORT_TEMPLATE.md`
