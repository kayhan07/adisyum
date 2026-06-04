#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/root/adisyum}"
APP_USER="${APP_USER:-root}"
DOMAIN="${DOMAIN:-adisyum.com}"
ROOT_PORT="${ROOT_PORT:-3000}"
WEBSITE_PORT="${WEBSITE_PORT:-3010}"
ROOT_ASSET_PREFIX="${ROOT_ASSET_PREFIX:-/adisyum-root-assets}"
WEBSITE_ASSET_PREFIX="${WEBSITE_ASSET_PREFIX:-/website-assets}"
ROOT_STATIC_DIR="${ROOT_STATIC_DIR:-/var/lib/adisyum/root-static}"
WEBSITE_STATIC_DIR="${WEBSITE_STATIC_DIR:-/var/lib/adisyum/website-static}"
SSL_CERT="${SSL_CERT:-/etc/ssl/cloudflare/origin.pem}"
SSL_KEY="${SSL_KEY:-/etc/ssl/cloudflare/origin.key}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/adisyum-clean-reconstruct}"
DOWNLOADS_ROOT="${DOWNLOADS_ROOT:-/var/lib/adisyum}"
DOWNLOADS_DIR="${DOWNLOADS_DIR:-${DOWNLOADS_ROOT}/downloads}"
TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TS}"
LOG_DIR="${APP_DIR}/deploy/logs"
LOG_FILE="${LOG_DIR}/reconstruct-vps-runtime-${TS}.log"

mkdir -p "${LOG_DIR}" "${BACKUP_DIR}"
exec > >(tee -a "${LOG_FILE}") 2>&1

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

fail() {
  log "ERROR: $*"
  log "Backup: ${BACKUP_DIR}"
  log "Log: ${LOG_FILE}"
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
    run sudo -E -H -u "${APP_USER}" env "PATH=${PATH}" "NVM_DIR=${NVM_DIR:-}" "$@"
  fi
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || fail "Run as root: sudo APP_DIR=${APP_DIR} APP_USER=${APP_USER} bash deploy/scripts/reconstruct-vps-runtime.sh"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

user_home() {
  local user="$1"
  getent passwd "${user}" 2>/dev/null | cut -d: -f6 || true
}

prepend_path() {
  local dir="$1"
  [[ -d "${dir}" ]] || return 0
  case ":${PATH}:" in
    *":${dir}:"*) ;;
    *) export PATH="${dir}:${PATH}" ;;
  esac
}

source_nvm_if_present() {
  local dir="$1"
  [[ -n "${dir}" && -s "${dir}/nvm.sh" ]] || return 1
  export NVM_DIR="${dir}"
  # shellcheck disable=SC1090
  source "${NVM_DIR}/nvm.sh"
  return 0
}

prepend_latest_nvm_node_bin() {
  local nvm_dir="$1"
  local latest=""
  [[ -d "${nvm_dir}/versions/node" ]] || return 0
  latest="$(find "${nvm_dir}/versions/node" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -V | tail -n 1 || true)"
  [[ -n "${latest}" ]] || return 0
  prepend_path "${latest}/bin"
}

bootstrap_node_toolchain() {
  log "Bootstrapping Node/npm/npx/pm2 toolchain for sudo/NVM environment"

  local current_home app_home candidate
  current_home="${HOME:-}"
  app_home="$(user_home "${APP_USER}")"

  export PATH="${PATH:-/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin}"
  prepend_path "/usr/local/bin"
  prepend_path "/usr/bin"
  prepend_path "/bin"

  for candidate in \
    "${NVM_DIR:-}" \
    "${current_home}/.nvm" \
    "${app_home}/.nvm" \
    "/root/.nvm"; do
    if source_nvm_if_present "${candidate}"; then
      log "Loaded NVM from ${candidate}"
      break
    fi
  done

  if command -v nvm >/dev/null 2>&1; then
    if [[ -f "${APP_DIR}/.nvmrc" ]]; then
      (cd "${APP_DIR}" && nvm use --silent) || true
    fi
    nvm use --silent default >/dev/null 2>&1 || true
    nvm use --silent node >/dev/null 2>&1 || true
  fi

  for candidate in \
    "${NVM_DIR:-}" \
    "${current_home}/.nvm" \
    "${app_home}/.nvm" \
    "/root/.nvm"; do
    prepend_latest_nvm_node_bin "${candidate}"
  done

  hash -r

  log "PATH=${PATH}"
  log "node=$(command -v node || true)"
  log "npm=$(command -v npm || true)"
  log "npx=$(command -v npx || true)"
  log "pm2=$(command -v pm2 || true)"
  node -v 2>/dev/null | sed 's/^/[node-version] /' || true
  npm -v 2>/dev/null | sed 's/^/[npm-version] /' || true

  command -v node >/dev/null 2>&1 || fail "Missing required command after NVM bootstrap: node"
  command -v npm >/dev/null 2>&1 || fail "Missing required command after NVM bootstrap: npm"
  command -v npx >/dev/null 2>&1 || fail "Missing required command after NVM bootstrap: npx"
}

ensure_pm2_toolchain() {
  if ! command -v pm2 >/dev/null 2>&1; then
    log "PM2 not found in repaired PATH; installing PM2 with resolved npm"
    npm install -g pm2
    hash -r
  fi

  command -v pm2 >/dev/null 2>&1 || fail "Missing required command after PM2 install: pm2"
  log "pm2=$(command -v pm2)"
  pm2 -v 2>/dev/null | sed 's/^/[pm2-version] /' || true
}

require_layout() {
  [[ -d "${APP_DIR}" ]] || fail "APP_DIR not found: ${APP_DIR}"
  [[ -f "${APP_DIR}/package.json" ]] || fail "Root package.json missing."
  [[ -f "${APP_DIR}/ecosystem.config.cjs" ]] || fail "ecosystem.config.cjs missing."
  [[ -d "${APP_DIR}/apps/website" ]] || fail "apps/website missing."
  [[ -f "${APP_DIR}/prisma/schema.prisma" ]] || fail "prisma/schema.prisma missing."
  [[ -s "${SSL_CERT}" ]] || fail "SSL certificate missing: ${SSL_CERT}"
  [[ -s "${SSL_KEY}" ]] || fail "SSL key missing: ${SSL_KEY}"
}

generate_secret() {
  openssl rand -base64 48 | tr -d '\n'
}

write_env_line() {
  local name="$1"
  local value="$2"
  printf '%s=%q\n' "${name}" "${value}"
}

recover_or_create_env() {
  cd "${APP_DIR}"

  if [[ -f ".env.production" ]]; then
    chmod 600 ".env.production" || true
    log "Using existing ${APP_DIR}/.env.production"
    return 0
  fi

  if [[ -f ".env" ]]; then
    cp -a ".env" ".env.production"
    chmod 600 ".env.production" || true
    log "Recovered .env.production from ${APP_DIR}/.env"
    return 0
  fi

  if [[ -f ".env.local" ]]; then
    cp -a ".env.local" ".env.production"
    chmod 600 ".env.production" || true
    log "Recovered .env.production from ${APP_DIR}/.env.local"
    return 0
  fi

  local recovered=""
  recovered="$(
    find /var/backups /root -maxdepth 7 -type f \( -name '.env.production' -o -name '.env' -o -name '.env.local' \) 2>/dev/null \
      | grep -v "^${APP_DIR}/" \
      | sort -r \
      | head -n 1 || true
  )"

  if [[ -n "${recovered}" && -s "${recovered}" ]]; then
    cp -a "${recovered}" ".env.production"
    chmod 600 ".env.production" || true
    log "Recovered .env.production from backup/env candidate: ${recovered}"
    return 0
  fi

  log "No existing env file found; creating ${APP_DIR}/.env.production with generated secrets and explicit required runtime fields"
  local generated_secret generated_admin generated_gib
  generated_secret="$(generate_secret)"
  generated_admin="$(generate_secret)"
  generated_gib="$(generate_secret)"

  {
    echo "# Generated by deploy/scripts/reconstruct-vps-runtime.sh on $(date -Is)"
    echo "# DATABASE_URL and Redis values cannot be invented safely; set them to the real production values."
    write_env_line NODE_ENV "production"
    write_env_line APP_ENV "production"
    write_env_line NEXT_PUBLIC_APP_URL "https://${DOMAIN}"
    write_env_line NEXTAUTH_URL "https://${DOMAIN}"
    write_env_line APP_URL "https://${DOMAIN}"
    write_env_line PUBLIC_APP_URL "https://${DOMAIN}"
    write_env_line SESSION_COOKIE_DOMAIN ".${DOMAIN}"
    write_env_line ADISYUM_ROOT_ASSET_PREFIX "${ROOT_ASSET_PREFIX}"
    write_env_line ADISYUM_WEBSITE_ASSET_PREFIX "${WEBSITE_ASSET_PREFIX}"
    write_env_line DATABASE_URL "${DATABASE_URL:-}"
    write_env_line POSTGRES_POOL_MAX "${POSTGRES_POOL_MAX:-10}"
    write_env_line POSTGRES_IDLE_TIMEOUT_MS "${POSTGRES_IDLE_TIMEOUT_MS:-30000}"
    write_env_line POSTGRES_CONNECT_TIMEOUT_MS "${POSTGRES_CONNECT_TIMEOUT_MS:-10000}"
    write_env_line SLOW_QUERY_THRESHOLD_MS "${SLOW_QUERY_THRESHOLD_MS:-300}"
    write_env_line ADISYUM_JWT_SECRET "${ADISYUM_JWT_SECRET:-${NEXTAUTH_SECRET:-${generated_secret}}}"
    write_env_line NEXTAUTH_SECRET "${NEXTAUTH_SECRET:-${ADISYUM_JWT_SECRET:-${generated_secret}}}"
    write_env_line ADISYUM_SUPER_ADMIN_PASSWORD "${ADISYUM_SUPER_ADMIN_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-1234}}"
    write_env_line BOOTSTRAP_TENANT_ID "${BOOTSTRAP_TENANT_ID:-}"
    write_env_line BOOTSTRAP_BRANCH_ID "${BOOTSTRAP_BRANCH_ID:-mrk}"
    write_env_line BOOTSTRAP_ADMIN_USERNAME "${BOOTSTRAP_ADMIN_USERNAME:-admin}"
    write_env_line BOOTSTRAP_ADMIN_PASSWORD "${BOOTSTRAP_ADMIN_PASSWORD:-1234}"
    write_env_line UPSTASH_REDIS_REST_URL "${UPSTASH_REDIS_REST_URL:-}"
    write_env_line UPSTASH_REDIS_REST_TOKEN "${UPSTASH_REDIS_REST_TOKEN:-}"
    write_env_line REDIS_URL "${REDIS_URL:-}"
    write_env_line UPLOAD_ROOT_DIR "${UPLOAD_ROOT_DIR:-${APP_DIR}/public/uploads}"
    write_env_line GIB_CREDENTIAL_SECRET "${GIB_CREDENTIAL_SECRET:-${generated_gib}}"
    write_env_line AURELIA_API_URL "${AURELIA_API_URL:-http://127.0.0.1:8000}"
    write_env_line AURELIA_TENANT_KEY "${AURELIA_TENANT_KEY:-default}"
    write_env_line AURELIA_BACKEND_EMAIL "${AURELIA_BACKEND_EMAIL:-admin@aurelia.local}"
    write_env_line AURELIA_BACKEND_PASSWORD "${AURELIA_BACKEND_PASSWORD:-}"
  } > ".env.production"
  chmod 600 ".env.production" || true
}

env_value_is_placeholder() {
  local value="${1:-}"
  [[ -z "${value}" ]] && return 0
  [[ "${value}" == *CHANGE_ME* ]] && return 0
  [[ "${value}" == *"<"*">"* ]] && return 0
  [[ "${value}" == *"example.com"* ]] && return 0
  [[ "${value}" == *'${'* ]] && return 0
  return 1
}

require_env_var() {
  local name="$1"
  local value="${!name:-}"
  if env_value_is_placeholder "${value}"; then
    MISSING_ENV+=("${name}")
  fi
}

require_secret_len() {
  local name="$1"
  local min_len="$2"
  local value="${!name:-}"
  if env_value_is_placeholder "${value}" || (( ${#value} < min_len )); then
    MISSING_ENV+=("${name} (must be at least ${min_len} chars)")
  fi
}

validate_database_url() {
  case "${DATABASE_URL:-}" in
    postgresql://*|postgres://*) ;;
    *) MISSING_ENV+=("DATABASE_URL (must start with postgresql:// or postgres://)") ;;
  esac
}

validate_environment() {
  MISSING_ENV=()

  require_env_var DATABASE_URL
  validate_database_url

  if [[ -z "${ADISYUM_JWT_SECRET:-}" && -n "${NEXTAUTH_SECRET:-}" ]]; then
    export ADISYUM_JWT_SECRET="${NEXTAUTH_SECRET}"
  fi
  if [[ -z "${NEXTAUTH_SECRET:-}" && -n "${ADISYUM_JWT_SECRET:-}" ]]; then
    export NEXTAUTH_SECRET="${ADISYUM_JWT_SECRET}"
  fi
  require_secret_len ADISYUM_JWT_SECRET 32
  require_secret_len NEXTAUTH_SECRET 32

  require_env_var ADISYUM_SUPER_ADMIN_PASSWORD
  require_env_var BOOTSTRAP_TENANT_ID
  require_env_var BOOTSTRAP_BRANCH_ID
  require_env_var BOOTSTRAP_ADMIN_USERNAME
  require_env_var BOOTSTRAP_ADMIN_PASSWORD

  require_env_var UPSTASH_REDIS_REST_URL
  require_env_var UPSTASH_REDIS_REST_TOKEN
  require_env_var REDIS_URL
  require_secret_len GIB_CREDENTIAL_SECRET 32

  if (( ${#MISSING_ENV[@]} > 0 )); then
    {
      echo "Missing or invalid production environment:"
      printf ' - %s\n' "${MISSING_ENV[@]}"
      echo
      echo "Create ${APP_DIR}/.env.production from ${APP_DIR}/.env.production.example and replace all CHANGE_ME values."
    } >&2
    fail "Production environment validation failed."
  fi

  export NEXTAUTH_SECRET ADISYUM_JWT_SECRET
  export BOOTSTRAP_TENANT_ID BOOTSTRAP_BRANCH_ID BOOTSTRAP_ADMIN_USERNAME BOOTSTRAP_ADMIN_PASSWORD
  export ADISYUM_SUPER_ADMIN_PASSWORD
  export DATABASE_URL UPSTASH_REDIS_REST_URL UPSTASH_REDIS_REST_TOKEN REDIS_URL GIB_CREDENTIAL_SECRET
  log "Production environment validation OK."
}

mask_secret() {
  local value="${1:-}"
  if [[ -z "${value}" ]]; then
    printf '<missing>'
  elif (( ${#value} <= 4 )); then
    printf '%*s' "${#value}" '' | tr ' ' '*'
  else
    printf '%s%s%s' "${value:0:2}" "$(printf '%*s' "$(( ${#value} - 4 ))" '' | tr ' ' '*')" "${value: -2}"
  fi
}

preflight_database_auth() {
  log "Preflight PostgreSQL authentication check"
  cd "${APP_DIR}"

  local parsed db_host db_port db_name db_user db_password db_sslmode
  parsed="$(
    node - <<'NODE'
const raw = process.env.DATABASE_URL;
try {
  const u = new URL(raw);
  const out = {
    db_host: u.hostname || '127.0.0.1',
    db_port: u.port || '5432',
    db_name: decodeURIComponent(u.pathname.replace(/^\//, '')),
    db_user: decodeURIComponent(u.username || ''),
    db_password: decodeURIComponent(u.password || ''),
    db_sslmode: u.searchParams.get('sslmode') || u.searchParams.get('ssl') || 'not-set',
  };
  for (const [key, value] of Object.entries(out)) {
    console.log(`${key}=${JSON.stringify(value)}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
NODE
  )" || fail "DATABASE_URL parse failed during PostgreSQL auth preflight."
  eval "${parsed}"

  log "DB preflight target host=${db_host} port=${db_port} database=${db_name} user=${db_user} sslmode=${db_sslmode} password=$(mask_secret "${db_password}")"
  [[ -n "${db_user}" ]] || fail "DATABASE_URL user is empty."
  [[ -n "${db_password}" ]] || fail "DATABASE_URL password is empty."
  [[ -n "${db_name}" ]] || fail "DATABASE_URL database name is empty."

  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h "${db_host}" -p "${db_port}" -d "${db_name}" -U "${db_user}" || true
  fi

  if command -v psql >/dev/null 2>&1; then
    local auth_error
    auth_error="$(mktemp)"
    if PGPASSWORD="${db_password}" psql -X -v ON_ERROR_STOP=1 -h "${db_host}" -p "${db_port}" -U "${db_user}" -d "${db_name}" -Atc "select current_user || '@' || current_database();" >/tmp/adisyum-db-preflight.out 2>"${auth_error}"; then
      log "PostgreSQL auth preflight OK: $(cat /tmp/adisyum-db-preflight.out)"
      rm -f "${auth_error}" /tmp/adisyum-db-preflight.out
      return 0
    fi

    log "PostgreSQL auth preflight failed: $(cat "${auth_error}")"
    rm -f "${auth_error}" /tmp/adisyum-db-preflight.out
    cat >&2 <<EOF

Database credentials are invalid or not authorized.

Safe diagnostics:
  APP_DIR=${APP_DIR} bash deploy/scripts/diagnose-postgres-auth.sh

Safe repair, if DATABASE_URL contains the intended production password:
  APP_DIR=${APP_DIR} bash deploy/scripts/repair-postgres-role.sh

This deploy is stopped before PM2/runtime cleanup to avoid partial production state.
EOF
    fail "PostgreSQL authentication preflight failed."
  fi

  log "psql not found; falling back to npm db:test-connection after dependency installation."
}

backup_preserved_state() {
  log "Creating reconstruction backup at ${BACKUP_DIR}"
  mkdir -p "${BACKUP_DIR}/project" "${BACKUP_DIR}/nginx" "${BACKUP_DIR}/pm2"

  cp -a "${APP_DIR}/.env" "${BACKUP_DIR}/project/.env" 2>/dev/null || true
  cp -a "${APP_DIR}/.env.production" "${BACKUP_DIR}/project/.env.production" 2>/dev/null || true
  cp -a "${APP_DIR}/.env.local" "${BACKUP_DIR}/project/.env.local" 2>/dev/null || true
  cp -a "${APP_DIR}/public/uploads" "${BACKUP_DIR}/project/uploads" 2>/dev/null || true
  cp -a "${APP_DIR}/uploads" "${BACKUP_DIR}/project/root-uploads" 2>/dev/null || true
  cp -a "${APP_DIR}/ecosystem.config.cjs" "${BACKUP_DIR}/project/ecosystem.config.cjs" 2>/dev/null || true
  cp -a "${APP_DIR}/deploy-production.sh" "${BACKUP_DIR}/project/deploy-production.sh" 2>/dev/null || true

  cp -a /etc/nginx/nginx.conf "${BACKUP_DIR}/nginx/nginx.conf" 2>/dev/null || true
  cp -a /etc/nginx/sites-available "${BACKUP_DIR}/nginx/sites-available" 2>/dev/null || true
  cp -a /etc/nginx/sites-enabled "${BACKUP_DIR}/nginx/sites-enabled" 2>/dev/null || true
  cp -a /etc/nginx/conf.d "${BACKUP_DIR}/nginx/conf.d" 2>/dev/null || true
  nginx -T > "${BACKUP_DIR}/nginx/nginx-T.before.txt" 2>&1 || true

  pm2 save || true
  cp -a "/root/.pm2/dump.pm2" "${BACKUP_DIR}/pm2/dump.pm2" 2>/dev/null || true

  git -C "${APP_DIR}" status --short > "${BACKUP_DIR}/project/git-status.txt" 2>/dev/null || true
  git -C "${APP_DIR}" rev-parse HEAD > "${BACKUP_DIR}/project/git-head.txt" 2>/dev/null || true
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
  if [[ -f ".env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ".env.local"
    set +a
  fi
  [[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required."
  [[ "${DATABASE_URL}" != *'$'* ]] || fail "DATABASE_URL contains unresolved variable syntax."

  export NODE_ENV=production
  export APP_ENV=production
  export GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)"
  export DEPLOYED_AT="${TS}"
  export ADISYUM_ROOT_ASSET_PREFIX="${ROOT_ASSET_PREFIX}"
  export ADISYUM_WEBSITE_ASSET_PREFIX="${WEBSITE_ASSET_PREFIX}"
  export NEXT_PUBLIC_APP_URL="https://${DOMAIN}"
  export NEXTAUTH_URL="https://${DOMAIN}"
  export APP_URL="https://${DOMAIN}"
  export PUBLIC_APP_URL="https://${DOMAIN}"
  export SESSION_COOKIE_DOMAIN=".${DOMAIN}"
  export UPLOAD_ROOT_DIR="${UPLOAD_ROOT_DIR:-${APP_DIR}/public/uploads}"
  export ADISYUM_SUPER_ADMIN_PASSWORD="${ADISYUM_SUPER_ADMIN_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-1234}}"
  export BOOTSTRAP_TENANT_ID="${BOOTSTRAP_TENANT_ID:-}"
  export BOOTSTRAP_BRANCH_ID="${BOOTSTRAP_BRANCH_ID:-mrk}"
  export BOOTSTRAP_ADMIN_USERNAME="${BOOTSTRAP_ADMIN_USERNAME:-admin}"
  export BOOTSTRAP_ADMIN_PASSWORD="${BOOTSTRAP_ADMIN_PASSWORD:-1234}"
  validate_environment
}

inspect_drift_before_cleanup() {
  log "Inspecting drift before cleanup"
  {
    echo "## PM2"
    pm2 list || true
    pm2 jlist || true
    echo
    echo "## Listening ports"
    ss -ltnp || true
    echo
    echo "## NGINX drift"
    nginx -T 2>/dev/null | grep -E "server_name|proxy_pass|location|3020|app\\.${DOMAIN}|admin\\.${DOMAIN}" || true
    echo
    echo "## Build/runtime artifacts"
    find "${APP_DIR}" -maxdepth 4 \( -name ".next" -o -name "standalone" -o -name ".output" -o -name "out" -o -name "node_modules" \) -print || true
  } > "${BACKUP_DIR}/drift-before-cleanup.txt" 2>&1 || true
}

stop_all_runtime() {
  log "Stopping all runtime services managed by PM2"
  pm2 delete all || true
  pm2 flush || true
  pm2 kill || true
}

clean_pm2_state() {
  log "Cleaning PM2 daemon, dump, pid, and socket state"
  local app_home
  app_home="$(getent passwd "${APP_USER}" | cut -d: -f6 || true)"
  [[ -n "${app_home}" ]] || app_home="/root"

  rm -f "${app_home}/.pm2/dump.pm2" "${app_home}/.pm2/dump.pm2.bak" "${app_home}/.pm2/module_conf.json" || true
  rm -rf "${app_home}/.pm2/pids" "${app_home}/.pm2/rpc.sock" "${app_home}/.pm2/pub.sock" || true
  rm -rf "/root/.pm2/pids" "/root/.pm2/rpc.sock" "/root/.pm2/pub.sock" || true
}

clean_filesystem_runtime() {
  log "Cleaning runtime/build/dependency artifacts while preserving source, env, DB, and uploads"
  cd "${APP_DIR}"

  rm -rf .next apps/website/.next
  rm -rf .next/standalone apps/website/.next/standalone standalone .output out
  rm -rf node_modules apps/website/node_modules
  rm -rf node_modules/.cache apps/website/node_modules/.cache
  rm -rf .turbo .cache .parcel-cache
  rm -f tsconfig.tsbuildinfo apps/website/tsconfig.tsbuildinfo
  rm -f ecosystem.config.js ecosystem.isolated.config.cjs apps/website/ecosystem.config.js
  rm -f deploy/nginx/app.conf deploy/nginx/admin.conf deploy/nginx/website.conf 2>/dev/null || true
}

install_dependencies() {
  log "Installing dependencies deterministically"
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

validate_node_runtime() {
  log "Validating Node runtime and local TypeScript bootstrap runner"
  cd "${APP_DIR}"
  node - <<'NODE'
console.log(`node runtime OK: ${process.versions.node}`);
NODE
  if ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 6) ? 0 : 1)"; then
    [[ -x "node_modules/.bin/tsx" ]] || fail "Node ${NODE_VERSION:-$(node --version)} cannot strip TypeScript and local node_modules/.bin/tsx is missing."
  fi
}

run_bootstrap_admin() {
  log "Bootstrapping production admin user"
  cd "${APP_DIR}"
  if node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 6) ? 0 : 1)"; then
    run_app node --experimental-strip-types scripts/bootstrap-admin.ts
  else
    run_app node_modules/.bin/tsx scripts/bootstrap-admin.ts
  fi
}

run_auth_verification() {
  log "Verifying and repairing bootstrap authentication state"
  cd "${APP_DIR}"
  local mode="${1:-runtime}"
  export AUTH_VERIFY_TENANT_ID="${AUTH_VERIFY_TENANT_ID:-${BOOTSTRAP_TENANT_ID}}"
  export AUTH_VERIFY_BRANCH_ID="${AUTH_VERIFY_BRANCH_ID:-${BOOTSTRAP_BRANCH_ID}}"
  export AUTH_VERIFY_USERNAME="${AUTH_VERIFY_USERNAME:-${BOOTSTRAP_ADMIN_USERNAME}}"
  export AUTH_VERIFY_PASSWORD="${AUTH_VERIFY_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD}}"
  if [[ "${mode}" == "db-only" ]]; then
    export AUTH_VERIFY_SKIP_RUNTIME=1
  else
    unset AUTH_VERIFY_SKIP_RUNTIME
    export AUTH_VERIFY_BASE_URL="${AUTH_VERIFY_BASE_URL:-http://127.0.0.1:${ROOT_PORT}}"
  fi
  if node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 6) ? 0 : 1)"; then
    run_app node --experimental-strip-types scripts/verify-auth.ts
  else
    run_app node_modules/.bin/tsx scripts/verify-auth.ts
  fi
}

validate_ecosystem() {
  log "Validating canonical PM2 ecosystem"
  cd "${APP_DIR}"
  node - <<'NODE'
const ecosystem = require('./ecosystem.config.cjs');
const apps = Array.isArray(ecosystem.apps) ? ecosystem.apps : [];
const names = apps.map((app) => app.name).sort().join(',');
if (names !== 'adisyum-root-app,adisyum-website,adisyum-worker') {
  throw new Error(`Invalid PM2 apps: ${names}`);
}
const root = apps.find((app) => app.name === 'adisyum-root-app');
const website = apps.find((app) => app.name === 'adisyum-website');
const worker = apps.find((app) => app.name === 'adisyum-worker');
if (!String(root?.script || '').endsWith('.next/standalone/server.js')) {
  throw new Error('adisyum-root-app must start the Next standalone server');
}
if (String(root?.env?.PORT || '') !== '3000') {
  throw new Error('adisyum-root-app must bind PORT=3000');
}
if (String(root?.env?.HOSTNAME || '') !== '0.0.0.0') {
  throw new Error('adisyum-root-app must bind HOSTNAME=0.0.0.0');
}
if (!String(website?.args || '').includes('-p 3010')) throw new Error('adisyum-website must start on port 3010');
if (!String(worker?.args || '').includes('workers/orchestration-worker.ts')) throw new Error('adisyum-worker must start orchestration worker');
if (apps.some((app) => /pos|system-admin/i.test(app.name) && !['adisyum-root-app', 'adisyum-website'].includes(app.name))) {
  throw new Error('Forbidden old PM2 app name found');
}
console.log('ecosystem OK:', names);
NODE
}

rebuild_prisma_and_typecheck() {
  log "Regenerating Prisma Client and validating TypeScript"
  cd "${APP_DIR}"
  run_app npm run db:inspect-env
  run_app npm run db:test-connection
  run_app npx prisma validate
  run_app npx prisma generate
  run_app npx prisma db push
  run_app npm run products:classify-types
  run_app env DRY_RUN=0 npm run products:migrate-lifecycle
  run_app npm run products:lifecycle-test
  run_app npm run products:catalog-test
  run_app npm run devices:runtime-test
  run_bootstrap_admin
  run_auth_verification db-only
  run_app npx tsc --noEmit
}

build_apps() {
  log "Building root app and website from clean artifacts"
  cd "${APP_DIR}"
  rm -rf ".next" "apps/website/.next"
  run_app node node_modules/next/dist/bin/next build
  [[ -s ".next/BUILD_ID" ]] || fail "Root .next/BUILD_ID missing"
  [[ -d ".next/server" ]] || fail "Root .next/server missing"
  [[ -d ".next/static" ]] || fail "Root .next/static missing"
  [[ -s ".next/standalone/server.js" ]] || fail "Root standalone server missing"
  node - <<'NODE'
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('.next/prerender-manifest.json', 'utf8'));
for (const route of ['/floor', '/orders']) {
  if (manifest.routes?.[route]) {
    throw new Error(`${route} must not be prerendered in production`);
  }
}
NODE
  if find ".next" -type f -name 'page-9eb4bafb6b86ab25.js' | grep -q .; then
    fail "Clean root build still contains stale floor bundle page-9eb4bafb6b86ab25.js"
  fi
  mkdir -p ".next/standalone/.next"
  rm -rf ".next/standalone/.next/static" ".next/standalone/public"
  mkdir -p ".next/standalone/.next/static" ".next/standalone/public"
  cp -a ".next/static/." ".next/standalone/.next/static/"
  cp -a "public/." ".next/standalone/public/"
  local root_static_source=".next/static"
  if ! find "${root_static_source}" -type f \( -name "*.css" -o -name "*.js" \) | grep -q .; then
    if find ".next/standalone/.next/static" -type f \( -name "*.css" -o -name "*.js" \) | grep -q .; then
      root_static_source=".next/standalone/.next/static"
    else
      fail "Root build did not expose CSS/JS files under .next/static or standalone static"
    fi
  fi
  rm -rf "${ROOT_STATIC_DIR}"
  mkdir -p "${ROOT_STATIC_DIR}"
  cp -a "${root_static_source}/." "${ROOT_STATIC_DIR}/"
  [[ -s ".next/standalone/.next/server/app/api/pos/table-orders/route.js" ]] || fail "Standalone /api/pos/table-orders artifact missing"
  [[ -d ".next/server/app/app" || -f ".next/server/app/app.html" || -f ".next/server/app/app/page.js" ]] || fail "Root /app build artifact missing"
  [[ -d ".next/server/app/system-admin" || -f ".next/server/app/system-admin.html" || -f ".next/server/app/system-admin/page.js" ]] || fail "Root /system-admin build artifact missing"
  run_app npm run routes:audit
  run_app npm run env:audit-production
  log "Root BUILD_ID=$(cat .next/BUILD_ID)"
  log "Root GIT_COMMIT=${GIT_COMMIT:-unknown} DEPLOYED_AT=${DEPLOYED_AT:-unknown}"

  run_app npm --prefix apps/website run build
  [[ -s "apps/website/.next/BUILD_ID" ]] || fail "Website .next/BUILD_ID missing"
  [[ -d "apps/website/.next/server" ]] || fail "Website .next/server missing"
  [[ -d "apps/website/.next/static" ]] || fail "Website .next/static missing"
  find "apps/website/.next/static" -type f \( -name "*.css" -o -name "*.js" \) | grep -q . || fail "Website static CSS/JS assets missing"
  rm -rf "${WEBSITE_STATIC_DIR}"
  mkdir -p "${WEBSITE_STATIC_DIR}"
  cp -a "apps/website/.next/static/." "${WEBSITE_STATIC_DIR}/"
  log "Website BUILD_ID=$(cat apps/website/.next/BUILD_ID)"
  run_app npm run runtime:audit-production
}

validate_and_publish_windows_downloads() {
  log "Validating and publishing persistent Windows download artifacts"
  cd "${APP_DIR}"

  local source_dir="${APP_DIR}/public/downloads/windows"
  local desktop="${source_dir}/latest/AdisyumDesktopSetup.exe"
  local printer="${source_dir}/latest/PrinterBridgeSetup.exe"
  local fiscal="${source_dir}/latest/FiscalPosBridgeSetup.exe"
  local manifest="${source_dir}/latest.json"

  [[ -d "${source_dir}" ]] || fail "Windows download source missing: ${source_dir}"
  [[ -s "${manifest}" ]] || fail "Windows download manifest missing: ${manifest}"

  node - "${desktop}" "${printer}" "${fiscal}" "${manifest}" <<'NODE'
const fs = require('fs');
const [desktop, printer, fiscal, manifest] = process.argv.slice(2);
const checks = [
  { name: 'AdisyumDesktopSetup.exe', file: desktop, min: 50 * 1024 * 1024 },
  { name: 'PrinterBridgeSetup.exe', file: printer, min: 100 * 1024 },
  { name: 'FiscalPosBridgeSetup.exe', file: fiscal, min: 100 * 1024 },
];
for (const check of checks) {
  if (!fs.existsSync(check.file)) throw new Error(`${check.name} missing at ${check.file}`);
  const stat = fs.statSync(check.file);
  if (stat.size < check.min) throw new Error(`${check.name} is too small: ${stat.size} bytes`);
  const fd = fs.openSync(check.file, 'r');
  const head = Buffer.alloc(2);
  try {
    fs.readSync(fd, head, 0, 2, 0);
  } finally {
    fs.closeSync(fd);
  }
  const sig = head.toString('ascii');
  if (sig !== 'MZ') throw new Error(`${check.name} is not a Windows PE executable`);
  console.log(`${check.name} OK ${stat.size} bytes`);
}
const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
if (!Array.isArray(parsed.files) || parsed.files.length < 3) throw new Error('latest.json does not list all Windows artifacts');
console.log(`manifest OK ${parsed.version} ${parsed.buildId}`);
NODE

  mkdir -p "${DOWNLOADS_DIR}"
  local staging="${DOWNLOADS_DIR}.staging-${TS}"
  rm -rf "${staging}"
  mkdir -p "${staging}"
  cp -a "${source_dir}" "${staging}/windows"
  rm -rf "${DOWNLOADS_DIR}/windows"
  mv "${staging}/windows" "${DOWNLOADS_DIR}/windows"
  rm -rf "${staging}"

  [[ -s "${DOWNLOADS_DIR}/windows/latest/AdisyumDesktopSetup.exe" ]] || fail "Persistent Windows desktop installer publish failed"
  log "Windows downloads published to ${DOWNLOADS_DIR}/windows"
  find "${DOWNLOADS_DIR}/windows" -maxdepth 3 -type f \( -name "*.exe" -o -name "*.json" \) -printf '%p %s bytes\n' | sort
}

start_pm2_clean() {
  log "Starting canonical PM2 apps"
  cd "${APP_DIR}"
  run_app pm2 start ecosystem.config.cjs --update-env
  sleep 8
  validate_pm2
  run_app pm2 save
}

validate_pm2() {
  log "Validating PM2 exact app set and restart stability"
  local names
  names="$(pm2 jlist | node -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{const apps=JSON.parse(s||'[]'); const names=apps.map(a=>a.name).sort(); console.log(names.join(',')); if(apps.length!==3) process.exit(2); if(names.join(',')!=='adisyum-root-app,adisyum-website,adisyum-worker') process.exit(3); if(names.includes('adisyum-pos-app')||names.includes('adisyum-system-admin')) process.exit(4); if(apps.some(a=>a.pm2_env.status!=='online')) process.exit(5); if(apps.some(a=>Number(a.pm2_env.restart_time||0)>2||Number(a.pm2_env.unstable_restarts||0)>0)) process.exit(6); const root=apps.find(a=>a.name==='adisyum-root-app'); if(!root || !String(root.pm2_env.pm_exec_path||'').endsWith('.next/standalone/server.js')) process.exit(7); if(String(root.pm2_env.PORT||'')!=='3000') process.exit(8); if(String(root.pm2_env.HOSTNAME||'')!=='0.0.0.0') process.exit(9);})")"
  [[ "${names}" == "adisyum-root-app,adisyum-website,adisyum-worker" ]] || fail "Unexpected PM2 state: ${names}"
  pm2 list
}

validate_live_ports() {
  log "Validating live listener ports"
  ss -ltnp | grep -E ":(${ROOT_PORT}|${WEBSITE_PORT})" || true
  ss -ltnp | awk -v port=":${ROOT_PORT}" '$1 == "LISTEN" && index($4, port) { found=1 } END { exit found ? 0 : 1 }' || fail "adisyum-root-app is not listening on ${ROOT_PORT}"
  ss -ltnp | awk -v port=":${WEBSITE_PORT}" '$1 == "LISTEN" && index($4, port) { found=1 } END { exit found ? 0 : 1 }' || fail "adisyum-website is not listening on ${WEBSITE_PORT}"
}

validate_runtime_build_identity() {
  log "Validating runtime build identity against active source"
  cd "${APP_DIR}"
  local url="${1:-http://127.0.0.1:${ROOT_PORT}/api/runtime-build-id}"
  local expected_build_id expected_commit
  expected_build_id="$(cat .next/BUILD_ID)"
  expected_commit="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || true)}"
  node - "${expected_build_id}" "${expected_commit}" "${url}" <<'NODE'
const [expectedBuildId, expectedCommit, url] = process.argv.slice(2);

async function main() {
  const response = await fetch(url, { cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(`${url} did not return runtime proof: HTTP ${response.status}`);
  }
  if (body.buildId !== expectedBuildId) {
    throw new Error(`Runtime BUILD_ID mismatch: live=${body.buildId} expected=${expectedBuildId}`);
  }
  if (!String(body.gitCommit || '').startsWith(expectedCommit)) {
    throw new Error(`Runtime git commit mismatch: live=${body.gitCommit} expected=${expectedCommit}`);
  }
  if (body.nodeEnv !== 'production') {
    throw new Error(`Runtime NODE_ENV mismatch: ${body.nodeEnv}`);
  }
  if (body.port !== '3000') {
    throw new Error(`Runtime PORT mismatch: ${body.port}`);
  }
  if (body.sessionCookieDomain !== '.adisyum.com') {
    throw new Error(`Runtime SESSION_COOKIE_DOMAIN mismatch: ${body.sessionCookieDomain}`);
  }
  if (!body.deploymentTime) {
    throw new Error('Runtime deploymentTime missing');
  }
  console.log(JSON.stringify({ ok: true, url, buildId: body.buildId, gitCommit: body.gitCommit, deploymentTime: body.deploymentTime }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE
}

write_nginx() {
  log "Reconstructing canonical NGINX config"
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d

  cat >/etc/nginx/conf.d/adisyum-websocket-map.conf <<'MAP'
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}
MAP

  cat >/etc/nginx/sites-available/adisyum.conf <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${DOMAIN} www.${DOMAIN};

    ssl_certificate ${SSL_CERT};
    ssl_certificate_key ${SSL_KEY};
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 50M;

    location = /downloads/windows/latest.json {
        root ${DOWNLOADS_ROOT};
        default_type application/json;
        try_files \$uri =404;
        add_header Cache-Control "no-store, max-age=0, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location ^~ /downloads/windows/latest/ {
        root ${DOWNLOADS_ROOT};
        types {
            application/octet-stream exe msi;
            application/zip zip;
            application/json json;
        }
        default_type application/octet-stream;
        try_files \$uri =404;
        add_header Cache-Control "no-store, max-age=0, must-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
        add_header Accept-Ranges bytes always;
    }

    location ^~ /downloads/ {
        root ${DOWNLOADS_ROOT};
        types {
            application/octet-stream exe msi;
            application/zip zip;
            application/json json;
        }
        default_type application/octet-stream;
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header Accept-Ranges bytes always;
    }

    location ^~ ${ROOT_ASSET_PREFIX}/_next/static/ {
        alias ${ROOT_STATIC_DIR}/;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location ^~ ${ROOT_ASSET_PREFIX}/_next/ {
        rewrite ^${ROOT_ASSET_PREFIX}(/_next/.*)\$ \$1 break;
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ ${WEBSITE_ASSET_PREFIX}/_next/static/ {
        alias ${WEBSITE_STATIC_DIR}/;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location ^~ ${WEBSITE_ASSET_PREFIX}/_next/ {
        rewrite ^${WEBSITE_ASSET_PREFIX}(/_next/.*)\$ \$1 break;
        proxy_pass http://127.0.0.1:${WEBSITE_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /_next/static/ {
        alias ${ROOT_STATIC_DIR}/;
        access_log off;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location ^~ /_next/ {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /adisyonsistemi {
        return 308 /app;
    }

    location ^~ /adisyonsistemi/ {
        return 308 /app;
    }

    location = /app {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /app/ {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /system-admin {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /system-admin/ {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = /api {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location ~ ^/(access|dashboard|pos|orders|products|warehouse|reports|finance|settings|branches|delivery|developer|bar-control|floor|integrations|kds|overview|qr|qr-menu|saas)(/|\$) {
        proxy_pass http://127.0.0.1:${ROOT_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate" always;
        add_header Pragma "no-cache" always;
        add_header Expires "0" always;
    }

    location / {
        proxy_pass http://127.0.0.1:${WEBSITE_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

  rm -f /etc/nginx/sites-enabled/default
  rm -f /etc/nginx/sites-enabled/app.conf /etc/nginx/sites-enabled/admin.conf /etc/nginx/sites-enabled/website.conf
  rm -f /etc/nginx/sites-available/app.conf /etc/nginx/sites-available/admin.conf /etc/nginx/sites-available/website.conf
  ln -sfn /etc/nginx/sites-available/adisyum.conf /etc/nginx/sites-enabled/adisyum.conf
}

validate_nginx() {
  log "Validating NGINX config and routing drift"
  nginx -t
  nginx -T > "${BACKUP_DIR}/nginx/nginx-T.after.txt" 2>&1

  if grep -Eq "server_name[[:space:]]+(app|admin)\\.${DOMAIN}" "${BACKUP_DIR}/nginx/nginx-T.after.txt"; then
    fail "Stale app/admin subdomain NGINX server block is active"
  fi
  if grep -Eq "proxy_pass[[:space:]]+http://127\\.0\\.0\\.1:3020" "${BACKUP_DIR}/nginx/nginx-T.after.txt"; then
    fail "Stale 3020 NGINX upstream is active"
  fi
  grep -Eq "location[[:space:]]+=[[:space:]]+/app" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing location = /app"
  grep -Eq "location[[:space:]]+\\^~[[:space:]]+/app/" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing location ^~ /app/"
  grep -Eq "location[[:space:]]+=[[:space:]]+/system-admin" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing location = /system-admin"
  grep -Eq "location[[:space:]]+\\^~[[:space:]]+/system-admin/" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing location ^~ /system-admin/"
  grep -Eq "location[[:space:]]+=[[:space:]]+/api" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing location = /api"
  grep -Eq "location[[:space:]]+\\^~[[:space:]]+/api/" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing location ^~ /api/"
  grep -Eq "location[[:space:]]+=[[:space:]]+/adisyonsistemi" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing legacy redirect location = /adisyonsistemi"
  grep -Eq "location[[:space:]]+\\^~[[:space:]]+/adisyonsistemi/" "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Missing legacy redirect location ^~ /adisyonsistemi/"
  awk '
    /location[[:space:]]+=[[:space:]]+\/api[[:space:]]*\{/ { in_api=1; exact=1; next }
    /location[[:space:]]+\^~[[:space:]]+\/api\// { in_api=1; prefix=1; next }
    in_api && /proxy_pass[[:space:]]+http:\/\/127\.0\.0\.1:'"${ROOT_PORT}"';/ { root_api=1 }
    in_api && /proxy_pass[[:space:]]+http:\/\/127\.0\.0\.1:'"${WEBSITE_PORT}"';/ { website_api=1 }
    in_api && /^\s*\}/ { in_api=0 }
    END { if (!exact || !prefix || !root_api || website_api) exit 1 }
  ' "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "NGINX /api namespace must proxy only to root app port ${ROOT_PORT}, never website port ${WEBSITE_PORT}"
  awk '
    /location[[:space:]]+=[[:space:]]+\/adisyonsistemi[[:space:]]*\{/ { in_legacy=1; exact=1; next }
    /location[[:space:]]+\^~[[:space:]]+\/adisyonsistemi\// { in_legacy=1; prefix=1; next }
    in_legacy && /return[[:space:]]+308[[:space:]]+\/app;/ { redirect=1 }
    in_legacy && /proxy_pass[[:space:]]+http:\/\/127\.0\.0\.1:/ { proxy=1 }
    in_legacy && /^\s*\}/ { in_legacy=0 }
    END { if (!exact || !prefix || !redirect || proxy) exit 1 }
  ' "${BACKUP_DIR}/nginx/nginx-T.after.txt" || fail "Legacy /adisyonsistemi must redirect to /app and must not proxy to any runtime"

  systemctl reload nginx
}

is_healthy_http_status() {
  local code="$1"
  case "${code}" in
    200|201|204|301|302|303|307|308) return 0 ;;
    *) return 1 ;;
  esac
}

wait_for_healthy_route() {
  local url="$1"
  local code="" final_code="" final_url=""
  for _ in $(seq 1 45); do
    code="$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 8 "${url}" || true)"
    if is_healthy_http_status "${code}"; then
      final_code="$(curl -kLsS -o /dev/null -w '%{http_code}' --max-time 15 "${url}" || true)"
      final_url="$(curl -kLsS -o /dev/null -w '%{url_effective}' --max-time 15 "${url}" || true)"

      if [[ "${code}" =~ ^30[12378]$ ]]; then
        if is_healthy_http_status "${final_code}"; then
          log "${url} HTTP ${code}; redirect target healthy (${final_code}) ${final_url}"
          return 0
        fi
      else
        log "${url} HTTP ${code}"
        return 0
      fi
    fi
    sleep 2
  done
  fail "${url} expected healthy HTTP 2xx/3xx, got initial=${code:-none} final=${final_code:-none} final_url=${final_url:-unknown}"
}

wait_for_route_not_404() {
  local method="$1"
  local url="$2"
  local code=""
  for _ in $(seq 1 30); do
    code="$(curl -ksS -X "${method}" -o /dev/null -w '%{http_code}' --max-time 8 "${url}" || true)"
    if [[ -n "${code}" && "${code}" != "000" && "${code}" != "404" ]]; then
      log "${method} ${url} HTTP ${code} (route registered)"
      return 0
    fi
    sleep 2
  done
  fail "${method} ${url} expected registered route, got HTTP ${code:-none}"
}

wait_for_route_status() {
  local method="$1"
  local url="$2"
  local expected="$3"
  local code=""
  for _ in $(seq 1 30); do
    code="$(curl -ksS -X "${method}" -o /dev/null -w '%{http_code}' --max-time 8 "${url}" || true)"
    if [[ "${code}" == "${expected}" ]]; then
      log "${method} ${url} HTTP ${code} (expected)"
      return 0
    fi
    if [[ "${code}" == "404" ]]; then
      log "${method} ${url} HTTP 404; API namespace is not routed to the root runtime yet"
    fi
    sleep 2
  done
  fail "${method} ${url} expected HTTP ${expected}, got HTTP ${code:-none}"
}

validate_next_page_asset() {
  local page_url="$1"
  local base_url="$2"
  local strip_prefix="${3:-}"
  local html_file asset_path asset_url code
  html_file="$(mktemp)"

  curl -ksS --max-time 15 "${page_url}" -o "${html_file}" || {
    rm -f "${html_file}"
    fail "Could not fetch page HTML for asset validation: ${page_url}"
  }

  asset_path="$(
    grep -Eo '(/[^"]*_next/static/[^"]+\.(css|js))' "${html_file}" \
      | head -n 1 \
      | sed 's/&amp;/\&/g' || true
  )"
  rm -f "${html_file}"

  [[ -n "${asset_path}" ]] || fail "${page_url} did not include a Next.js CSS/JS asset path"

  if [[ -n "${strip_prefix}" && "${asset_path}" == "${strip_prefix}"/* ]]; then
    asset_path="${asset_path#"${strip_prefix}"}"
  fi

  asset_url="${base_url}${asset_path}"
  code="$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 15 "${asset_url}" || true)"
  [[ "${code}" == "200" ]] || fail "Next.js page asset is not reachable: ${asset_url} HTTP ${code:-none}"
  log "Next.js page asset reachable: ${asset_url} HTTP ${code}"
}

validate_live_floor_bundle() {
  local page_url="$1"
  local html_file asset_path asset_file
  html_file="$(mktemp)"

  curl -ksS --max-time 15 "${page_url}" -o "${html_file}" || {
    rm -f "${html_file}"
    fail "Could not fetch /floor HTML for bundle validation: ${page_url}"
  }

  if grep -q 'page-9eb4bafb6b86ab25\.js' "${html_file}"; then
    rm -f "${html_file}"
    fail "${page_url} is still serving the stale floor bundle page-9eb4bafb6b86ab25.js"
  fi

  asset_path="$(
    grep -Eo '(/[^"]*_next/static/[^"]+app/floor/page-[^"]+\.js)' "${html_file}" \
      | head -n 1 \
      | sed 's/&amp;/\&/g' || true
  )"
  rm -f "${html_file}"

  [[ -n "${asset_path}" ]] || fail "${page_url} did not include a /floor page bundle"
  asset_path="${asset_path#"${ROOT_ASSET_PREFIX}/_next/static/"}"
  asset_path="${asset_path#"/_next/static/"}"
  asset_file="${ROOT_STATIC_DIR}/${asset_path}"

  [[ -s "${asset_file}" ]] || fail "Live /floor bundle asset missing from root static dir: ${asset_file}"
  grep -q 'floor-sync-bind-open-orders-v3' "${asset_file}" \
    || fail "Live /floor bundle does not contain floor-sync-bind-open-orders-v3: ${asset_file}"
  log "Live /floor bundle contains floor-sync-bind-open-orders-v3: ${asset_file}"
}

validate_runtime_routes() {
  log "Validating local and public runtime routes"
  if ss -ltnp | grep -q ':3020'; then
    ss -ltnp | grep ':3020' || true
    fail "Port 3020 is listening"
  fi

  wait_for_healthy_route "http://127.0.0.1:${ROOT_PORT}"
  wait_for_healthy_route "http://127.0.0.1:${ROOT_PORT}/app"
  wait_for_healthy_route "http://127.0.0.1:${ROOT_PORT}/system-admin"
  wait_for_healthy_route "http://127.0.0.1:${WEBSITE_PORT}"
  wait_for_route_status "POST" "http://127.0.0.1:${ROOT_PORT}/api/pos/table-orders" "401"
  wait_for_route_not_404 "GET" "http://127.0.0.1:${ROOT_PORT}/api/runtime/pos-catalog"
  wait_for_route_not_404 "GET" "http://127.0.0.1:${ROOT_PORT}/api/runtime-build-id"
  validate_runtime_build_identity "http://127.0.0.1:${ROOT_PORT}/api/runtime-build-id"
  validate_next_page_asset "http://127.0.0.1:${ROOT_PORT}/app" "http://127.0.0.1:${ROOT_PORT}" "${ROOT_ASSET_PREFIX}"
  validate_live_floor_bundle "http://127.0.0.1:${ROOT_PORT}/floor"

  wait_for_healthy_route "https://${DOMAIN}"
  wait_for_healthy_route "https://${DOMAIN}/app"
  wait_for_healthy_route "https://${DOMAIN}/system-admin"
  wait_for_healthy_route "https://${DOMAIN}/adisyonsistemi"
  wait_for_route_status "POST" "https://${DOMAIN}/api/pos/table-orders" "401"
  wait_for_route_not_404 "GET" "https://${DOMAIN}/api/runtime-build-id"
  validate_runtime_build_identity "https://${DOMAIN}/api/runtime-build-id"
  validate_next_page_asset "https://${DOMAIN}/" "https://${DOMAIN}" ""
  validate_next_page_asset "https://${DOMAIN}/app" "https://${DOMAIN}" ""
  validate_next_page_asset "https://${DOMAIN}/system-admin/login" "https://${DOMAIN}" ""
  validate_live_floor_bundle "https://${DOMAIN}/floor"
}

print_final_state() {
  cat <<EOF

Clean VPS reconstruction completed.

Root cause:
- VPS runtime/deployment state drifted from source truth: stale PM2 dump/processes, stale NGINX routes, stale build artifacts, stale dependency/generated outputs, and old split-domain/runtime assumptions.

Preserved:
- Current source code in ${APP_DIR}
- .env files
- Database
- uploads/assets

Rebuilt:
- node_modules
- Prisma Client
- .next build artifacts
- PM2 state
- NGINX routing
- runtime processes

Canonical filesystem layout:
- ${APP_DIR}/app                 root Next.js app routes
- ${APP_DIR}/apps/website        website Next.js app
- ${APP_DIR}/.next               root production build
- ${APP_DIR}/apps/website/.next  website production build
- ${APP_DIR}/ecosystem.config.cjs canonical two-app PM2 config

Final PM2 apps:
- adisyum-root-app   -> 0.0.0.0:${ROOT_PORT}
- adisyum-website    -> 127.0.0.1:${WEBSITE_PORT}
- adisyum-worker     -> BullMQ orchestration worker

Final NGINX map:
- https://${DOMAIN}              -> http://127.0.0.1:${WEBSITE_PORT}
- https://${DOMAIN}/app          -> http://127.0.0.1:${ROOT_PORT}/app
- https://${DOMAIN}/system-admin -> http://127.0.0.1:${ROOT_PORT}/system-admin

Build IDs:
- Root: $(cat "${APP_DIR}/.next/BUILD_ID")
- Website: $(cat "${APP_DIR}/apps/website/.next/BUILD_ID")

Backup:
- ${BACKUP_DIR}

Log:
- ${LOG_FILE}
EOF
}

main() {
  require_root
  require_command openssl
  require_command getent
  bootstrap_node_toolchain
  require_command node
  require_command npm
  require_command npx
  ensure_pm2_toolchain
  require_command pm2
  require_command nginx
  require_command curl
  require_command grep
  require_command ss
  require_command systemctl
  require_layout
  recover_or_create_env

  backup_preserved_state
  inspect_drift_before_cleanup
  load_env
  preflight_database_auth
  if [[ "${DESTRUCTIVE_RECONSTRUCT:-0}" == "1" ]]; then
    log "DESTRUCTIVE_RECONSTRUCT=1 enabled; stopping runtime and cleaning build filesystem before validation"
    stop_all_runtime
    clean_pm2_state
    clean_filesystem_runtime
  else
    log "Safe deploy mode: keeping current PM2 runtime online until build and validation complete"
  fi
  install_dependencies
  validate_node_runtime
  validate_ecosystem
  rebuild_prisma_and_typecheck
  build_apps
  validate_and_publish_windows_downloads
  stop_all_runtime
  clean_pm2_state
  start_pm2_clean
  validate_live_ports
  run_auth_verification
  write_nginx
  validate_nginx
  validate_runtime_routes
  print_final_state
}

main "$@"
