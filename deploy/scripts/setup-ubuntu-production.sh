#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/adisyum}"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"
DOMAIN="${DOMAIN:-adisyum.com}"
SSL_DIR="/etc/ssl/cloudflare"
ORIGIN_PEM="${SSL_DIR}/origin.pem"
ORIGIN_KEY="${SSL_DIR}/origin.key"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo APP_DIR=/root/adisyum APP_USER=root bash deploy/scripts/setup-ubuntu-production.sh"
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "APP_DIR not found: ${APP_DIR}"
  exit 1
fi

echo "==> Installing system packages"
apt update
apt install -y nginx curl lsof

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

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2"
  npm install -g pm2
fi

cd "${APP_DIR}"

echo "==> Running canonical production deployment"
APP_DIR="${APP_DIR}" \
APP_USER="${APP_USER}" \
DOMAIN_ROOT="https://${DOMAIN}" \
DOMAIN_APP="https://${DOMAIN}/app" \
DOMAIN_ADMIN="https://${DOMAIN}/system-admin" \
bash deploy-production.sh

echo "==> Configuring PM2 startup"
USER_HOME="$(eval echo "~${APP_USER}")"
env PATH="${PATH}" pm2 startup systemd -u "${APP_USER}" --hp "${USER_HOME}" || true

cat <<EOF

Setup completed with canonical architecture:
- adisyum.com -> website app on 3010
- adisyum.com/app -> root app on 3000
- adisyum.com/system-admin -> root app on 3000

There is no app.adisyum.com, admin.adisyum.com, or port 3020 runtime in this architecture.

Check:
curl -I https://${DOMAIN}
curl -I https://${DOMAIN}/app
curl -I https://${DOMAIN}/system-admin
pm2 list
EOF
