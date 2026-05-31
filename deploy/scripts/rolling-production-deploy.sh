#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/adisyum}"
APP_USER="${APP_USER:-root}"
ROOT_PORT="${ROOT_PORT:-3000}"
WEBSITE_PORT="${WEBSITE_PORT:-3010}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

run() {
  log "RUN: $*"
  "$@"
}

run_app() {
  if [[ "$(id -un)" == "${APP_USER}" ]]; then
    run "$@"
  else
    run sudo -E -H -u "${APP_USER}" env "PATH=${PATH}" "$@"
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

load_env() {
  cd "${APP_DIR}"
  if [[ -f ".env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ".env"
    set +a
  fi
  if [[ -f ".env.production" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ".env.production"
    set +a
  fi
  export NODE_ENV=production
  export APP_ENV=production
  export GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"
  export DEPLOYED_AT="$(date +%Y%m%d-%H%M%S)"
  export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://adisyum.com}"
  export NEXTAUTH_URL="${NEXTAUTH_URL:-https://adisyum.com}"
  export APP_URL="${APP_URL:-https://adisyum.com}"
  export PUBLIC_APP_URL="${PUBLIC_APP_URL:-https://adisyum.com}"
  export SESSION_COOKIE_DOMAIN="${SESSION_COOKIE_DOMAIN:-.adisyum.com}"
}

ensure_dependencies() {
  cd "${APP_DIR}"
  if [[ -f package-lock.json ]]; then
    run_app npm ci --include=dev
  else
    run_app npm install --include=dev
  fi

  if [[ -f apps/website/package-lock.json ]]; then
    run_app npm --prefix apps/website ci --include=dev
  else
    run_app npm --prefix apps/website install --include=dev
  fi
}

build_without_stopping_runtime() {
  cd "${APP_DIR}"
  log "Building while current PM2 processes stay online"
  run_app npx prisma generate
  run_app node node_modules/next/dist/bin/next build
  [[ -s ".next/BUILD_ID" ]] || fail "Root .next/BUILD_ID missing"
  [[ -s ".next/standalone/server.js" ]] || fail "Root standalone server missing"
  mkdir -p ".next/standalone/.next"
  rm -rf ".next/standalone/.next/static" ".next/standalone/public"
  cp -a ".next/static" ".next/standalone/.next/static"
  cp -a "public" ".next/standalone/public"

  run_app npm --prefix apps/website run build
  [[ -s "apps/website/.next/BUILD_ID" ]] || fail "Website .next/BUILD_ID missing"
}

reload_or_start_pm2() {
  cd "${APP_DIR}"
  log "Reloading PM2 apps after successful build"

  if pm2 describe adisyum-root-app >/dev/null 2>&1; then
    run_app pm2 reload adisyum-root-app --update-env
  else
    run_app pm2 start .next/standalone/server.js --name adisyum-root-app --update-env
  fi

  if pm2 describe adisyum-website >/dev/null 2>&1; then
    run_app pm2 reload adisyum-website --update-env
  else
    run_app pm2 start ./node_modules/next/dist/bin/next --name adisyum-website --cwd "${APP_DIR}/apps/website" -- start -p "${WEBSITE_PORT}"
  fi

  if pm2 describe adisyum-worker >/dev/null 2>&1; then
    run_app pm2 reload adisyum-worker --update-env
  else
    run_app pm2 start node_modules/tsx/dist/cli.mjs --name adisyum-worker -- workers/orchestration-worker.ts
  fi

  run_app pm2 save
}

validate_routes() {
  log "Validating local routes"
  curl -fsSI --max-time 10 "http://127.0.0.1:${ROOT_PORT}/system-admin/login" >/dev/null || fail "system-admin login is not healthy"
  curl -fsSI --max-time 10 "http://127.0.0.1:${ROOT_PORT}/app/login" >/dev/null || fail "app login is not healthy"
  curl -fsSI --max-time 10 "http://127.0.0.1:${WEBSITE_PORT}" >/dev/null || fail "website is not healthy"
  ss -ltnp | grep -E ":(${ROOT_PORT}|${WEBSITE_PORT})" || true
  pm2 list
}

main() {
  require_command git
  require_command node
  require_command npm
  require_command npx
  require_command pm2
  require_command curl
  require_command ss
  [[ -d "${APP_DIR}" ]] || fail "APP_DIR not found: ${APP_DIR}"

  cd "${APP_DIR}"
  load_env
  log "Starting rolling production deploy for $(git rev-parse --short HEAD 2>/dev/null || true)"
  ensure_dependencies
  build_without_stopping_runtime
  reload_or_start_pm2
  validate_routes
  log "Rolling production deploy completed without stop-all runtime cleanup."
}

main "$@"
