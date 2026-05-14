#!/usr/bin/env bash
set -euo pipefail

DOMAIN_ROOT="${DOMAIN_ROOT:-adisyum.com}"
DOMAIN_WWW="${DOMAIN_WWW:-www.adisyum.com}"
DOMAIN_APP="${DOMAIN_APP:-app.adisyum.com}"
DOMAIN_ADMIN="${DOMAIN_ADMIN:-admin.adisyum.com}"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"
LOG_DIR="${LOG_DIR:-./deploy/logs}"
TS="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/isolated-go-live-${TS}.log"

mkdir -p "${LOG_DIR}"

echo "Adisyum isolated go-live validation $(date -Is)" | tee "${LOG_FILE}"

action() {
  local title="$1"
  shift
  echo | tee -a "${LOG_FILE}"
  echo "## ${title}" | tee -a "${LOG_FILE}"
  echo "$ $*" | tee -a "${LOG_FILE}"
  if "$@" 2>&1 | tee -a "${LOG_FILE}"; then
    echo "[OK] ${title}" | tee -a "${LOG_FILE}"
  else
    echo "[FAIL] ${title}" | tee -a "${LOG_FILE}"
    return 1
  fi
}

soft_action() {
  local title="$1"
  shift
  echo | tee -a "${LOG_FILE}"
  echo "## ${title}" | tee -a "${LOG_FILE}"
  echo "$ $*" | tee -a "${LOG_FILE}"
  if "$@" 2>&1 | tee -a "${LOG_FILE}"; then
    echo "[OK] ${title}" | tee -a "${LOG_FILE}"
  else
    echo "[WARN] ${title}" | tee -a "${LOG_FILE}"
  fi
}

action "NGINX syntax" sudo nginx -t
action "PM2 list" su - "${APP_USER}" -c "pm2 list"
action "PM2 isolated processes" su - "${APP_USER}" -c "pm2 jlist | grep -E 'adisyum-website|adisyum-pos-app|adisyum-system-admin'"

action "Domain root HTTPS" curl -Ik "https://${DOMAIN_ROOT}"
action "Domain www HTTPS" curl -Ik "https://${DOMAIN_WWW}"
action "Domain app HTTPS" curl -Ik "https://${DOMAIN_APP}"
action "Domain admin HTTPS" curl -Ik "https://${DOMAIN_ADMIN}"

action "Website upstream 3010 reachable" bash -lc "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3010 | grep -E '200|301|302|404'"
action "POS upstream 3000 reachable" bash -lc "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3000 | grep -E '200|301|302|404'"
action "Admin upstream 3020 reachable" bash -lc "curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3020 | grep -E '200|301|302|404'"

action "SSL cert root" bash -lc "echo | openssl s_client -servername ${DOMAIN_ROOT} -connect ${DOMAIN_ROOT}:443 2>/dev/null | openssl x509 -noout -subject -issuer"
action "SSL cert app" bash -lc "echo | openssl s_client -servername ${DOMAIN_APP} -connect ${DOMAIN_APP}:443 2>/dev/null | openssl x509 -noout -subject -issuer"
action "SSL cert admin" bash -lc "echo | openssl s_client -servername ${DOMAIN_ADMIN} -connect ${DOMAIN_ADMIN}:443 2>/dev/null | openssl x509 -noout -subject -issuer"

action "Cloudflare proxy headers root" bash -lc "curl -I https://${DOMAIN_ROOT} | grep -Ei 'cf-ray|cf-cache-status|server: cloudflare'"
action "Cloudflare proxy headers app" bash -lc "curl -I https://${DOMAIN_APP} | grep -Ei 'cf-ray|cf-cache-status|server: cloudflare'"

# WebSocket handshake check (status 101 expected for realtime endpoints that support ws)
soft_action "WebSocket probe app" bash -lc "curl -i -N -sS -o /tmp/ws-app.txt -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==' https://${DOMAIN_APP}/socket.io/?EIO=4\&transport=websocket ; grep -E '101|400|426' /tmp/ws-app.txt"

action "Nginx websocket headers configured" sudo nginx -T
action "Port listeners" bash -lc "sudo ss -ltnp | grep -E ':3010|:3000|:3020|:443|:80'"

soft_action "Redis ping" bash -lc "redis-cli ping"
soft_action "PostgreSQL connections" bash -lc "psql -Atqc 'select count(*) from pg_stat_activity;'"

echo | tee -a "${LOG_FILE}"
echo "Manual validations required (browser):" | tee -a "${LOG_FILE}"
echo "- app.adisyum.com realtime views: table/kitchen/monitoring/desktop-bridge/telemetry" | tee -a "${LOG_FILE}"
echo "- DevTools -> Network -> WS shows 101 Switching Protocols" | tee -a "${LOG_FILE}"
echo "- POS smoke: login, masa aç, ürün ekle, sipariş, ödeme, mutfak fişi, QR menü" | tee -a "${LOG_FILE}"
echo "- Admin smoke: system-admin login, tenant provisioning, observability tabs" | tee -a "${LOG_FILE}"
echo "- Website smoke: homepage, pricing, CTA, mobile, forms/buttons, SEO meta" | tee -a "${LOG_FILE}"

echo "Validation log: ${LOG_FILE}" | tee -a "${LOG_FILE}"
