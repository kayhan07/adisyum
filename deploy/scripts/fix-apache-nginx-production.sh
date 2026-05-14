#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-adisyum.com}"
APP_NAME="${APP_NAME:-adisyum}"
SITE_PATH="/etc/nginx/sites-available/${APP_NAME}"
SSL_CERT="${SSL_CERT:-/etc/ssl/cloudflare/origin.pem}"
SSL_KEY="${SSL_KEY:-/etc/ssl/cloudflare/origin.key}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo DOMAIN=${DOMAIN} APP_NAME=${APP_NAME} bash deploy/scripts/fix-apache-nginx-production.sh"
  exit 1
fi

echo "==> Stop and remove Apache if present"
systemctl stop apache2 2>/dev/null || true
systemctl disable apache2 2>/dev/null || true
pkill apache2 2>/dev/null || true
pkill httpd 2>/dev/null || true
apt remove apache2 apache2-bin apache2-data apache2-utils -y 2>/dev/null || true
apt autoremove -y 2>/dev/null || true

echo "==> Verify SSL files"
test -s "${SSL_CERT}"
test -s "${SSL_KEY}"
chmod 644 "${SSL_CERT}"
chmod 600 "${SSL_KEY}"

echo "==> Write exact Nginx production config"
cat > "${SITE_PATH}" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name adisyum.com www.adisyum.com;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name adisyum.com www.adisyum.com;

    ssl_certificate /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin.key;

    gzip on;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;

        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

echo "==> Enable site and remove default"
rm -f /etc/nginx/sites-enabled/default
ln -sf "${SITE_PATH}" "/etc/nginx/sites-enabled/${APP_NAME}"

echo "==> Test and restart Nginx"
nginx -t
systemctl restart nginx
systemctl enable nginx

echo "==> Port ownership"
ss -tulpn | grep -E ':80|:443|:3000' || true

echo "==> PM2 status"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list
else
  echo "pm2 command not found"
fi

echo "==> Origin tests with cache bypass"
curl -IL -H 'Cache-Control: no-cache' "https://${DOMAIN}" || true
curl -IL -H 'Cache-Control: no-cache' "http://${DOMAIN}" || true
curl -I -H 'Cache-Control: no-cache' "https://${DOMAIN}" | grep -Ei 'server:|cf-ray|cf-cache-status|x-powered-by|location:' || true

cat <<EOF

Done.

If browser still shows Apache:
1. Cloudflare -> Caching -> Purge Everything
2. Cloudflare -> enable Development Mode for 3 minutes
3. Browser hard refresh: Ctrl+F5
4. Test incognito/private window
EOF
