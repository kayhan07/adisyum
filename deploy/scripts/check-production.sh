#!/usr/bin/env bash
set -u

DOMAIN="${DOMAIN:-adisyum.com}"
APP_NAME="${APP_NAME:-adisyum}"
LOG_DIR="${LOG_DIR:-./deploy/logs}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
LOG_FILE="${LOG_DIR}/production-check-${TIMESTAMP}.log"

mkdir -p "${LOG_DIR}"

run_check() {
  local title="$1"
  shift

  {
    echo
    echo "## ${title}"
    echo "\$ $*"
  } | tee -a "${LOG_FILE}"

  "$@" 2>&1 | tee -a "${LOG_FILE}"
  local status=${PIPESTATUS[0]}

  if [[ ${status} -eq 0 ]]; then
    echo "[OK] ${title}" | tee -a "${LOG_FILE}"
  else
    echo "[FAIL] ${title} (exit=${status})" | tee -a "${LOG_FILE}"
  fi

  return ${status}
}

print_result() {
  local title="$1"
  local expected="$2"
  local actual="$3"

  {
    echo
    echo "## ${title}"
    echo "Expected: ${expected}"
    echo "Actual: ${actual}"
  } | tee -a "${LOG_FILE}"
}

echo "Adisyum production check started at $(date -Is)" | tee "${LOG_FILE}"
echo "DOMAIN=${DOMAIN}" | tee -a "${LOG_FILE}"
echo "APP_NAME=${APP_NAME}" | tee -a "${LOG_FILE}"

run_check "NGINX STATUS" systemctl is-active nginx
run_check "PM2 LIST" pm2 list
run_check "PM2 LOGS LAST 100" pm2 logs "${APP_NAME}" --lines 100 --nostream
run_check "PORT 3000" sudo lsof -i :3000
run_check "PORT 443" sudo lsof -i :443
run_check "PORT 80" sudo lsof -i :80
run_check "NGINX CONFIG TEST" sudo nginx -t
run_check "HTTPS TEST" curl -IL "https://${DOMAIN}"
run_check "HTTP REDIRECT TEST" curl -IL "http://${DOMAIN}"
run_check "CLOUDFLARE HEADERS" bash -lc "curl -I 'https://${DOMAIN}' | grep -Ei 'cloudflare|cf-ray|cf-cache-status|server:'"
run_check "SERVER HEADER" bash -lc "curl -I 'https://${DOMAIN}' | grep -i '^server:'"
run_check "WEBSOCKET NGINX HEADERS" bash -lc "sudo nginx -T 2>/dev/null | grep -E 'proxy_set_header (Upgrade|Connection)'"
run_check "SECURITY HEADERS" bash -lc "curl -I 'https://${DOMAIN}' | grep -Ei 'strict-transport|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'"

HTTPS_STATUS="$(curl -ILs -o /dev/null -w '%{http_code}' "https://${DOMAIN}")"
HTTP_REDIRECT="$(curl -ILs -o /dev/null -w '%{http_code} %{url_effective}' "http://${DOMAIN}")"
CF_SERVER="$(curl -Is "https://${DOMAIN}" | awk 'BEGIN{IGNORECASE=1} /^server:/{print $0; exit}')"
NGINX_ACTIVE="$(systemctl is-active nginx 2>/dev/null || true)"

print_result "SUMMARY NGINX" "active" "${NGINX_ACTIVE}"
print_result "SUMMARY HTTPS" "200, 301, 304, or app-specific success" "${HTTPS_STATUS}"
print_result "SUMMARY HTTP REDIRECT" "final URL starts with https://${DOMAIN}" "${HTTP_REDIRECT}"
print_result "SUMMARY CLOUDFLARE" "server: cloudflare" "${CF_SERVER}"

cat <<EOF | tee -a "${LOG_FILE}"

Manual Cloudflare panel check:
- SSL/TLS -> Overview -> Full (strict)
- DNS -> ${DOMAIN} proxied orange cloud
- Edge Certificates -> Always Use HTTPS enabled
- Network -> HTTP/3 enabled
- Speed -> Brotli enabled

Log saved to: ${LOG_FILE}
EOF
