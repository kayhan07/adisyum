#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/adisyum}"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"
DOMAIN_ROOT="${DOMAIN_ROOT:-adisyum.com}"
WEBSITE_PORT="${WEBSITE_PORT:-3010}"
ROOT_APP_PORT="${ROOT_APP_PORT:-3000}"
NGINX_AVAILABLE="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"
NGINX_CONFD="/etc/nginx/conf.d"
SNAP_ROOT="${SNAP_ROOT:-/var/backups/adisyum-routing-fix}"
TS="$(date +%Y%m%d-%H%M%S)"
SNAP_DIR="${SNAP_ROOT}/${TS}"
ROLLBACK_SCRIPT="${SNAP_DIR}/rollback.sh"
DISABLED_DIR="${SNAP_DIR}/disabled-conflicts"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

fail() {
  log "ERROR: $*"
  log "Rollback: ${ROLLBACK_SCRIPT}"
  exit 1
}

domain_regex() {
  printf '%s' "$1" | sed 's/[.[\*^$()+?{}|\\]/\\&/g'
}

TARGET_DOMAIN_RE="$(printf '%s|www\\.%s|app\\.%s|admin\\.%s' \
  "$(domain_regex "${DOMAIN_ROOT}")" \
  "$(domain_regex "${DOMAIN_ROOT}")" \
  "$(domain_regex "${DOMAIN_ROOT}")" \
  "$(domain_regex "${DOMAIN_ROOT}")")"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo/root."
  exit 1
fi

if [[ ! -d "${APP_DIR}" ]]; then
  echo "APP_DIR not found: ${APP_DIR}"
  exit 1
fi

mkdir -p "${SNAP_DIR}/nginx" "${SNAP_DIR}/pm2" "${DISABLED_DIR}/sites-enabled" "${DISABLED_DIR}/sites-available" "${DISABLED_DIR}/conf.d"
cp -a /etc/nginx/nginx.conf "${SNAP_DIR}/nginx/nginx.conf" || true
cp -a "${NGINX_CONFD}" "${SNAP_DIR}/nginx/conf.d" || true
cp -a /etc/nginx/sites-available "${SNAP_DIR}/nginx/sites-available" || true
cp -a /etc/nginx/sites-enabled "${SNAP_DIR}/nginx/sites-enabled" || true
nginx -T > "${SNAP_DIR}/nginx/nginx-T.before.txt" 2>&1 || true

if command -v pm2 >/dev/null 2>&1; then
  su - "${APP_USER}" -c "pm2 save" || true
  PM2_HOME_DIR="$(eval echo ~${APP_USER})/.pm2"
  cp -a "${PM2_HOME_DIR}/dump.pm2" "${SNAP_DIR}/pm2/dump.pm2" 2>/dev/null || true
fi

cat > "${ROLLBACK_SCRIPT}" <<'RB'
#!/usr/bin/env bash
set -euo pipefail

SNAP_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"

cp -a "${SNAP_DIR}/nginx/nginx.conf" /etc/nginx/nginx.conf 2>/dev/null || true
rm -rf /etc/nginx/conf.d
cp -a "${SNAP_DIR}/nginx/conf.d" /etc/nginx/conf.d 2>/dev/null || true
rm -rf /etc/nginx/sites-available
cp -a "${SNAP_DIR}/nginx/sites-available" /etc/nginx/sites-available 2>/dev/null || true
rm -rf /etc/nginx/sites-enabled
cp -a "${SNAP_DIR}/nginx/sites-enabled" /etc/nginx/sites-enabled 2>/dev/null || true
nginx -t
systemctl reload nginx

if [[ -f "${SNAP_DIR}/pm2/dump.pm2" ]] && command -v pm2 >/dev/null 2>&1; then
  USER_HOME="$(eval echo ~${APP_USER})"
  install -d -m 755 "${USER_HOME}/.pm2"
  cp -a "${SNAP_DIR}/pm2/dump.pm2" "${USER_HOME}/.pm2/dump.pm2"
  chown -R "${APP_USER}:${APP_USER}" "${USER_HOME}/.pm2"
  su - "${APP_USER}" -c "pm2 resurrect" || true
fi

echo "Rollback completed from ${SNAP_DIR}."
RB
chmod +x "${ROLLBACK_SCRIPT}"

disable_enabled_conflict() {
  local file="$1"
  local base resolved
  [[ -e "${file}" ]] || return 0
  base="$(basename "${file}")"
  resolved="$(readlink -f "${file}" || true)"
  [[ -n "${resolved}" && -f "${resolved}" ]] || return 0

  if grep -Eq "server_name[[:space:]]+.*(${TARGET_DOMAIN_RE})" "${resolved}"; then
    if [[ "${base}" != "adisyum.conf" ]]; then
      rm -f "${file}"
      log "Disabled conflicting enabled vhost: ${file} -> ${resolved}"
    fi
  fi
}

remove_stale_available_conflict() {
  local file="$1"
  local base
  [[ -f "${file}" ]] || return 0
  base="$(basename "${file}")"

  if [[ "${base}" == "adisyum.conf" ]]; then
    return 0
  fi

  if grep -Eq "server_name[[:space:]]+.*(${TARGET_DOMAIN_RE})|proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:(3020|${ROOT_APP_PORT})" "${file}"; then
    mv "${file}" "${DISABLED_DIR}/sites-available/${base}"
    log "Removed stale available vhost: ${file}"
  fi
}

remove_confd_conflict() {
  local file="$1"
  local base
  [[ -f "${file}" ]] || return 0
  base="$(basename "${file}")"

  if [[ "${base}" == "cloudflare-real-ip.conf" || "${base}" == "websocket-map.conf" ]]; then
    return 0
  fi

  if grep -Eq "server_name[[:space:]]+.*(${TARGET_DOMAIN_RE})|proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:(3020|${ROOT_APP_PORT}|${WEBSITE_PORT})" "${file}"; then
    mv "${file}" "${DISABLED_DIR}/conf.d/${base}"
    log "Removed conflicting conf.d include: ${file}"
  fi
}

assert_active_routes() {
  local dump="$1"

  grep -Eq "server_name[[:space:]]+${DOMAIN_ROOT}[[:space:]]+www\\.${DOMAIN_ROOT};" "${dump}" \
    || fail "Missing canonical ${DOMAIN_ROOT} server_name block."
  grep -Eq "proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:${WEBSITE_PORT};" "${dump}" \
    || fail "Missing website upstream 127.0.0.1:${WEBSITE_PORT}."
  grep -Eq "proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:${ROOT_APP_PORT};" "${dump}" \
    || fail "Missing root app upstream 127.0.0.1:${ROOT_APP_PORT}."
  grep -Eq "location[[:space:]]+=[[:space:]]+/app" "${dump}" \
    || fail "Missing exact path-preserving location = /app."
  grep -Eq "location[[:space:]]+\\^~[[:space:]]+/app/" "${dump}" \
    || fail "Missing path-preserving location ^~ /app/."
  grep -Eq "location[[:space:]]+=[[:space:]]+/system-admin" "${dump}" \
    || fail "Missing exact path-preserving location = /system-admin."
  grep -Eq "location[[:space:]]+\\^~[[:space:]]+/system-admin/" "${dump}" \
    || fail "Missing path-preserving location ^~ /system-admin/."

  if grep -Eq "server_name[[:space:]]+(app|admin)\\.${DOMAIN_ROOT}" "${dump}"; then
    fail "Split-domain app/admin server_name blocks are still active."
  fi

  if grep -Eq "proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:3020;" "${dump}"; then
    fail "Stale admin upstream 127.0.0.1:3020 is still active."
  fi
}

fetch_body() {
  local url="$1"
  curl -kLsS --max-time 30 "${url}" || true
}

assert_body_contains() {
  local url="$1"
  local expected="$2"
  local body
  body="$(fetch_body "${url}")"
  printf '%s' "${body}" | grep -q "${expected}" || fail "${url} did not contain expected marker: ${expected}"
  log "${url} marker OK (${expected})"
}

log "Snapshot ready: ${SNAP_DIR}"
log "Installing single-domain monolith NGINX routing"
install -m 644 "${APP_DIR}/deploy/nginx/cloudflare-real-ip.conf" "${NGINX_CONFD}/cloudflare-real-ip.conf"
install -m 644 "${APP_DIR}/deploy/nginx/websocket-map.conf" "${NGINX_CONFD}/websocket-map.conf"
install -m 644 "${APP_DIR}/deploy/nginx/adisyum.conf" "${NGINX_AVAILABLE}/adisyum.conf"

log "Removing split-domain and duplicate root-runtime NGINX configs"
rm -f "${NGINX_ENABLED}/default" "${NGINX_ENABLED}/app.conf" "${NGINX_ENABLED}/admin.conf"
rm -f "${NGINX_AVAILABLE}/app.conf" "${NGINX_AVAILABLE}/admin.conf"

for file in "${NGINX_ENABLED}"/*; do
  disable_enabled_conflict "${file}"
done

for file in "${NGINX_AVAILABLE}"/*.conf; do
  remove_stale_available_conflict "${file}"
done

for file in "${NGINX_CONFD}"/*.conf; do
  remove_confd_conflict "${file}"
done

ln -sfn "${NGINX_AVAILABLE}/adisyum.conf" "${NGINX_ENABLED}/adisyum.conf"

log "Testing NGINX syntax before reload"
nginx -t

nginx -T > "${SNAP_DIR}/nginx/nginx-T.after.txt" 2>&1

log "Active production server_name/proxy_pass map"
awk '/server_name/ || /proxy_pass/ || /listen/ || /location/ { print }' "${SNAP_DIR}/nginx/nginx-T.after.txt" \
  | grep -E "adisyum\\.com|127\\.0\\.0\\.1:(${WEBSITE_PORT}|${ROOT_APP_PORT}|3020)|location" || true

assert_active_routes "${SNAP_DIR}/nginx/nginx-T.after.txt"

log "Reloading NGINX"
systemctl reload nginx

log "Local backend listener validation"
if command -v pm2 >/dev/null 2>&1; then
  su - "${APP_USER}" -c "pm2 list" || true
fi
ss -ltnp | grep -E ":${WEBSITE_PORT}|:${ROOT_APP_PORT}|:3020|:443|:80" || true
curl -fsS "http://127.0.0.1:${WEBSITE_PORT}" >/dev/null || fail "Local website backend failed: 127.0.0.1:${WEBSITE_PORT}"
curl -fsS "http://127.0.0.1:${ROOT_APP_PORT}" >/dev/null || fail "Local root app backend failed: 127.0.0.1:${ROOT_APP_PORT}"
if ss -ltn | grep -Eq ':3020[[:space:]]'; then
  fail "Port 3020 is still listening; duplicate root Next runtime must be stopped."
fi

log "Local TLS ingress validation by Host header"
curl -ksSI -H "Host: ${DOMAIN_ROOT}" https://127.0.0.1 | head -20 || true
curl -ksSI -H "Host: www.${DOMAIN_ROOT}" https://127.0.0.1 | head -20 || true
curl -ksSI -H "Host: ${DOMAIN_ROOT}" https://127.0.0.1/app | head -20 || true
curl -ksSI -H "Host: ${DOMAIN_ROOT}" https://127.0.0.1/system-admin | head -20 || true

log "Public marker validation"
assert_body_contains "https://${DOMAIN_ROOT}" "adisyum_web_"
assert_body_contains "https://${DOMAIN_ROOT}/app" "adisyon_"
assert_body_contains "https://${DOMAIN_ROOT}/system-admin" "adisyon_"

cat <<EOF

Routing fix completed.

Active architecture:
- adisyum-website  -> 127.0.0.1:${WEBSITE_PORT} -> https://${DOMAIN_ROOT}/
- adisyum-root-app -> 127.0.0.1:${ROOT_APP_PORT} -> https://${DOMAIN_ROOT}/app and /system-admin

Removed:
- app.${DOMAIN_ROOT}
- admin.${DOMAIN_ROOT}
- 127.0.0.1:3020 admin upstream
- duplicate root Next.js runtime

Disabled stale/conflicting configs:
${DISABLED_DIR}

Active nginx dump:
${SNAP_DIR}/nginx/nginx-T.after.txt

Rollback:
${ROLLBACK_SCRIPT}
EOF
