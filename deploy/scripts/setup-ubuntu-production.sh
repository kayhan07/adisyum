#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-adisyum}"
APP_DIR="${APP_DIR:-/var/www/adisyum}"
DOMAIN="${DOMAIN:-adisyum.com}"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"
NGINX_SITE="/etc/nginx/sites-available/${APP_NAME}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}"
SSL_DIR="/etc/ssl/cloudflare"
ORIGIN_PEM="${SSL_DIR}/origin.pem"
ORIGIN_KEY="${SSL_DIR}/origin.key"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash deploy/scripts/setup-ubuntu-production.sh"
  exit 1
fi

echo "==> Installing nginx"
apt update
apt install -y nginx

echo "==> Configuring firewall"
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Preparing Cloudflare origin certificate directory"
mkdir -p "${SSL_DIR}"
chmod 755 "${SSL_DIR}"

if [[ ! -s "${ORIGIN_PEM}" || ! -s "${ORIGIN_KEY}" ]]; then
  cat <<EOF

Cloudflare Origin Certificate files are missing.

Create them in Cloudflare:
SSL/TLS -> Origin Server -> Create Certificate
Hostnames:
- ${DOMAIN}
- *.${DOMAIN}

Then place:
- ${ORIGIN_PEM}
- ${ORIGIN_KEY}

After adding the files, rerun this script.
EOF
  exit 1
fi

chmod 644 "${ORIGIN_PEM}"
chmod 600 "${ORIGIN_KEY}"

echo "==> Installing Cloudflare real IP config"
install -m 644 deploy/nginx/cloudflare-real-ip.conf /etc/nginx/conf.d/cloudflare-real-ip.conf
install -m 644 deploy/nginx/websocket-map.conf /etc/nginx/conf.d/websocket-map.conf

echo "==> Installing nginx site"
install -m 644 deploy/nginx/adisyum.conf "${NGINX_SITE}"
ln -sfn "${NGINX_SITE}" "${NGINX_ENABLED}"
rm -f /etc/nginx/sites-enabled/default

echo "==> Testing nginx"
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> Building Next.js app"
cd "${APP_DIR}"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi
sudo -H -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && npm ci && npm run build"

echo "==> Starting PM2 process as ${APP_USER}"
if sudo -H -u "${APP_USER}" bash -lc "pm2 describe '${APP_NAME}' >/dev/null 2>&1"; then
  sudo -H -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pm2 restart '${APP_NAME}' --update-env"
else
  sudo -H -u "${APP_USER}" bash -lc "cd '${APP_DIR}' && pm2 start npm --name '${APP_NAME}' -- start"
fi
sudo -H -u "${APP_USER}" bash -lc "pm2 save"

echo "==> Configuring PM2 startup"
USER_HOME="$(eval echo "~${APP_USER}")"
env PATH="${PATH}" pm2 startup systemd -u "${APP_USER}" --hp "${USER_HOME}" || true

echo "==> Done"
echo "Check:"
echo "curl -I http://${DOMAIN}"
echo "curl -I https://${DOMAIN}"
echo "pm2 list"
