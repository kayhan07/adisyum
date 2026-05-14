#!/usr/bin/env bash
set -euo pipefail

SNAP_ROOT="${SNAP_ROOT:-/var/backups/adisyum-cutover}"
APP_USER="${APP_USER:-${SUDO_USER:-www-data}}"
SNAPSHOT="${1:-latest}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo/root."
  exit 1
fi

if [[ ! -d "${SNAP_ROOT}" ]]; then
  echo "Snapshot root not found: ${SNAP_ROOT}"
  exit 1
fi

if [[ "${SNAPSHOT}" == "latest" ]]; then
  SNAP_DIR="$(ls -1d "${SNAP_ROOT}"/* 2>/dev/null | tail -n1 || true)"
else
  SNAP_DIR="${SNAP_ROOT}/${SNAPSHOT}"
fi

if [[ -z "${SNAP_DIR:-}" || ! -d "${SNAP_DIR}" ]]; then
  echo "Snapshot not found. Available:"
  ls -1 "${SNAP_ROOT}" || true
  exit 1
fi

echo "==> Using snapshot: ${SNAP_DIR}"

cp -a "${SNAP_DIR}/nginx/nginx.conf" /etc/nginx/nginx.conf 2>/dev/null || true
rm -rf /etc/nginx/conf.d
cp -a "${SNAP_DIR}/nginx/conf.d" /etc/nginx/conf.d 2>/dev/null || true
rm -rf /etc/nginx/sites-available
cp -a "${SNAP_DIR}/nginx/sites-available" /etc/nginx/sites-available 2>/dev/null || true
rm -rf /etc/nginx/sites-enabled
cp -a "${SNAP_DIR}/nginx/sites-enabled" /etc/nginx/sites-enabled 2>/dev/null || true

nginx -t
systemctl reload nginx

PM2_HOME_DIR="$(eval echo ~${APP_USER})/.pm2"
if [[ -f "${SNAP_DIR}/pm2/dump.pm2" ]]; then
  install -d -m 755 "${PM2_HOME_DIR}"
  cp -a "${SNAP_DIR}/pm2/dump.pm2" "${PM2_HOME_DIR}/dump.pm2"
  chown -R "${APP_USER}:${APP_USER}" "${PM2_HOME_DIR}"
  su - "${APP_USER}" -c "pm2 resurrect" || true
  su - "${APP_USER}" -c "pm2 save" || true
fi

echo "Rollback complete."
