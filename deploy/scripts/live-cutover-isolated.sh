#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/adisyum}"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"
DOMAIN_ROOT="${DOMAIN_ROOT:-adisyum.com}"
DOMAIN_APP="${DOMAIN_APP:-app.adisyum.com}"
DOMAIN_ADMIN="${DOMAIN_ADMIN:-admin.adisyum.com}"
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"
SNAP_ROOT="${SNAP_ROOT:-/var/backups/adisyum-cutover}"
TS="$(date +%Y%m%d-%H%M%S)"
SNAP_DIR="${SNAP_ROOT}/${TS}"
ROLLBACK_SCRIPT="${SNAP_DIR}/rollback.sh"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo/root."
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "APP_DIR not found: ${APP_DIR}"
  exit 1
fi

mkdir -p "${SNAP_DIR}" "${SNAP_DIR}/nginx" "${SNAP_DIR}/pm2" "${SNAP_DIR}/env" "${SNAP_DIR}/db"

echo "==> Snapshot: ${SNAP_DIR}"

# 1) NGINX snapshot
cp -a /etc/nginx/nginx.conf "${SNAP_DIR}/nginx/nginx.conf" || true
cp -a /etc/nginx/conf.d "${SNAP_DIR}/nginx/conf.d" || true
cp -a /etc/nginx/sites-available "${SNAP_DIR}/nginx/sites-available" || true
cp -a /etc/nginx/sites-enabled "${SNAP_DIR}/nginx/sites-enabled" || true
nginx -T > "${SNAP_DIR}/nginx/nginx-T.before.txt" 2>&1 || true

# 2) PM2 snapshot
su - "${APP_USER}" -c "pm2 save" || true
PM2_HOME_DIR="$(eval echo ~${APP_USER})/.pm2"
cp -a "${PM2_HOME_DIR}/dump.pm2" "${SNAP_DIR}/pm2/dump.pm2" 2>/dev/null || true
cp -a "${APP_DIR}/ecosystem.config.cjs" "${SNAP_DIR}/pm2/ecosystem.config.cjs" 2>/dev/null || true
cp -a "${APP_DIR}/ecosystem.config.js" "${SNAP_DIR}/pm2/ecosystem.config.js" 2>/dev/null || true
cp -a "${APP_DIR}/ecosystem.isolated.config.cjs" "${SNAP_DIR}/pm2/ecosystem.isolated.config.cjs" 2>/dev/null || true

# 3) Env snapshot
find "${APP_DIR}" -maxdepth 1 -type f -name ".env*" -print0 | while IFS= read -r -d '' f; do
  cp -a "$f" "${SNAP_DIR}/env/" || true
done

# 4) Database snapshots (best-effort)
if command -v pg_dumpall >/dev/null 2>&1; then
  su - postgres -c "pg_dumpall" > "${SNAP_DIR}/db/postgres-all.sql" 2>/dev/null || echo "WARN: pg_dumpall failed" >&2
else
  echo "WARN: pg_dumpall not found" >&2
fi

if command -v redis-cli >/dev/null 2>&1; then
  redis-cli BGSAVE >/dev/null 2>&1 || true
  sleep 2
  cp -a /var/lib/redis/dump.rdb "${SNAP_DIR}/db/redis-dump.rdb" 2>/dev/null || true
else
  echo "WARN: redis-cli not found" >&2
fi

# Prepare rollback helper bound to this snapshot
cat > "${ROLLBACK_SCRIPT}" <<'RB'
#!/usr/bin/env bash
set -euo pipefail

SNAP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"

echo "==> Rolling back using snapshot: ${SNAP_DIR}"

cp -a "${SNAP_DIR}/nginx/nginx.conf" /etc/nginx/nginx.conf 2>/dev/null || true
rm -rf /etc/nginx/conf.d
cp -a "${SNAP_DIR}/nginx/conf.d" /etc/nginx/conf.d 2>/dev/null || true
rm -rf /etc/nginx/sites-available
cp -a "${SNAP_DIR}/nginx/sites-available" /etc/nginx/sites-available 2>/dev/null || true
rm -rf /etc/nginx/sites-enabled
cp -a "${SNAP_DIR}/nginx/sites-enabled" /etc/nginx/sites-enabled 2>/dev/null || true

nginx -t
systemctl reload nginx

if [[ -f "${SNAP_DIR}/pm2/dump.pm2" ]]; then
  USER_HOME="$(eval echo ~${APP_USER})"
  install -d -m 755 "${USER_HOME}/.pm2"
  cp -a "${SNAP_DIR}/pm2/dump.pm2" "${USER_HOME}/.pm2/dump.pm2"
  chown -R "${APP_USER}:${APP_USER}" "${USER_HOME}/.pm2"
  su - "${APP_USER}" -c "pm2 resurrect" || true
  su - "${APP_USER}" -c "pm2 save" || true
fi

echo "Rollback completed."
RB
chmod +x "${ROLLBACK_SCRIPT}"

# 5) Install isolated NGINX configs
install -m 644 "${APP_DIR}/deploy/nginx/cloudflare-real-ip.conf" /etc/nginx/conf.d/cloudflare-real-ip.conf
install -m 644 "${APP_DIR}/deploy/nginx/websocket-map.conf" /etc/nginx/conf.d/websocket-map.conf
install -m 644 "${APP_DIR}/deploy/nginx/adisyum.conf" "${NGINX_AVAILABLE}/adisyum-website.conf"
install -m 644 "${APP_DIR}/deploy/nginx/app.conf" "${NGINX_AVAILABLE}/adisyum-app.conf"
install -m 644 "${APP_DIR}/deploy/nginx/admin.conf" "${NGINX_AVAILABLE}/adisyum-admin.conf"

# 6) Disable conflicting enabled vhosts with same domains
for file in "${NGINX_ENABLED}"/*; do
  [[ -e "$file" ]] || continue
  resolved="$(readlink -f "$file" || true)"
  [[ -f "$resolved" ]] || continue

  if grep -Eq "server_name[[:space:]]+.*(adisyum\\.com|www\\.adisyum\\.com|app\\.adisyum\\.com|admin\\.adisyum\\.com)" "$resolved"; then
    base="$(basename "$file")"
    if [[ "$base" != "adisyum-website.conf" && "$base" != "adisyum-app.conf" && "$base" != "adisyum-admin.conf" ]]; then
      rm -f "$file"
      echo "Disabled conflicting vhost: ${base}"
    fi
  fi
done

ln -sfn "${NGINX_AVAILABLE}/adisyum-website.conf" "${NGINX_ENABLED}/adisyum-website.conf"
ln -sfn "${NGINX_AVAILABLE}/adisyum-app.conf" "${NGINX_ENABLED}/adisyum-app.conf"
ln -sfn "${NGINX_AVAILABLE}/adisyum-admin.conf" "${NGINX_ENABLED}/adisyum-admin.conf"

# 7) NGINX safe reload
if ! nginx -t; then
  echo "ERROR: nginx -t failed. Run rollback: ${ROLLBACK_SCRIPT}"
  exit 1
fi
systemctl reload nginx

# 8) PM2 isolated startup
if [[ ! -f "${APP_DIR}/ecosystem.isolated.config.cjs" ]]; then
  echo "ERROR: missing ${APP_DIR}/ecosystem.isolated.config.cjs"
  exit 1
fi

# POS safety: avoid killing an unknown process already bound to 3000.
if ss -ltn '( sport = :3000 )' | grep -q ':3000'; then
  echo "INFO: Port 3000 already in use; starting website/admin first, then attempting POS reload by name only."
  su - "${APP_USER}" -c "cd '${APP_DIR}' && pm2 start ecosystem.isolated.config.cjs --env production --only adisyum-website,adisyum-system-admin || true"
  su - "${APP_USER}" -c "cd '${APP_DIR}' && pm2 restart adisyum-pos-app --update-env || true"
else
  su - "${APP_USER}" -c "cd '${APP_DIR}' && pm2 start ecosystem.isolated.config.cjs --env production"
fi

su - "${APP_USER}" -c "pm2 save"
USER_HOME="$(eval echo ~${APP_USER})"
env PATH="$PATH" pm2 startup systemd -u "${APP_USER}" --hp "${USER_HOME}" >/dev/null 2>&1 || true

# 9) Initial endpoint checks
check() {
  local expectedHost="$1"
  local code
  code="$(curl -ksS -o /dev/null -w '%{http_code}' -H "Host: ${expectedHost}" "https://127.0.0.1")"
  echo "${expectedHost} => ${code}"
}

echo "==> Domain smoke checks (local TLS ingress)"
check "${DOMAIN_ROOT}"
check "www.${DOMAIN_ROOT}"
check "${DOMAIN_APP}"
check "${DOMAIN_ADMIN}"

echo "==> Cutover complete"
echo "Rollback script: ${ROLLBACK_SCRIPT}"
