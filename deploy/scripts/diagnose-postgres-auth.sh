#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.production}"
POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-postgres}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

warn() {
  log "WARN: $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

mask() {
  local value="${1:-}"
  if [[ -z "${value}" ]]; then
    printf '<missing>'
  elif (( ${#value} <= 4 )); then
    printf '%*s' "${#value}" '' | tr ' ' '*'
  else
    printf '%s%s%s' "${value:0:2}" "$(printf '%*s' "$(( ${#value} - 4 ))" '' | tr ' ' '*')" "${value: -2}"
  fi
}

load_env() {
  cd "${APP_DIR}"
  if [[ -f ".env" ]]; then set -a; source ".env"; set +a; fi
  if [[ -f "${ENV_FILE}" ]]; then set -a; source "${ENV_FILE}"; set +a; fi
  if [[ -f ".env.local" ]]; then set -a; source ".env.local"; set +a; fi
}

parse_database_url() {
  [[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL missing"
  command -v node >/dev/null 2>&1 || fail "node is required to parse DATABASE_URL safely"
  local parsed
  parsed="$(node -e '
const raw = process.env.DATABASE_URL;
try {
  const u = new URL(raw);
  const rows = {
    DB_PROTOCOL: u.protocol.replace(":", ""),
    DB_HOST: u.hostname || "127.0.0.1",
    DB_PORT: u.port || "5432",
    DB_NAME: decodeURIComponent(u.pathname.replace(/^\//, "")),
    DB_USER: decodeURIComponent(u.username || ""),
    DB_PASSWORD: decodeURIComponent(u.password || ""),
    DB_SSLMODE: u.searchParams.get("sslmode") || u.searchParams.get("ssl") || "not-set",
  };
  for (const [k, v] of Object.entries(rows)) console.log(`${k}=${JSON.stringify(v)}`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
' 2>/tmp/adisyum-db-url-parse.err)" || fail "DATABASE_URL parse failed: $(cat /tmp/adisyum-db-url-parse.err 2>/dev/null || true)"
  eval "${parsed}"
  [[ "${DB_PROTOCOL}" == "postgresql" || "${DB_PROTOCOL}" == "postgres" ]] || fail "DATABASE_URL protocol must be postgres/postgresql, got ${DB_PROTOCOL}"
}

psql_as_superuser() {
  local db="${1:-postgres}"
  shift || true
  if [[ "$(id -un)" == "${POSTGRES_SUPERUSER}" ]]; then
    psql -X -v ON_ERROR_STOP=1 -d "${db}" "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -u "${POSTGRES_SUPERUSER}" psql -X -v ON_ERROR_STOP=1 -d "${db}" "$@"
  else
    runuser -u "${POSTGRES_SUPERUSER}" -- psql -X -v ON_ERROR_STOP=1 -d "${db}" "$@"
  fi
}

load_env
parse_database_url

log "PostgreSQL auth diagnostic started"
log "App dir: ${APP_DIR}"
log "DB target: host=${DB_HOST} port=${DB_PORT} database=${DB_NAME} user=${DB_USER} sslmode=${DB_SSLMODE} password=$(mask "${DB_PASSWORD}")"

if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet postgresql && log "PostgreSQL service: active" || warn "PostgreSQL service is not active according to systemctl"
fi

if command -v pg_isready >/dev/null 2>&1; then
  pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -d "${DB_NAME}" -U "${DB_USER}" || warn "pg_isready did not report ready for DATABASE_URL user"
else
  warn "pg_isready not installed"
fi

if command -v ss >/dev/null 2>&1; then
  ss -ltnp | grep -E "(:${DB_PORT}[[:space:]])" >/dev/null && log "Port ${DB_PORT}: listening" || warn "Port ${DB_PORT} is not visible in ss output"
fi

if command -v psql >/dev/null 2>&1; then
  log "Checking local socket superuser access"
  psql_as_superuser postgres -Atc "select current_user || '@' || current_database();" || warn "Could not access local postgres socket as ${POSTGRES_SUPERUSER}"

  log "Checking database existence"
  db_exists="$(psql_as_superuser postgres -Atc "select 1 from pg_database where datname = '${DB_NAME//\'/\'\'}';" 2>/dev/null || true)"
  [[ "${db_exists}" == "1" ]] && log "Database exists: ${DB_NAME}" || warn "Database missing or not visible: ${DB_NAME}"

  log "Checking role existence"
  role_exists="$(psql_as_superuser postgres -Atc "select 1 from pg_roles where rolname = '${DB_USER//\'/\'\'}';" 2>/dev/null || true)"
  [[ "${role_exists}" == "1" ]] && log "Role exists: ${DB_USER}" || warn "Role missing or not visible: ${DB_USER}"

  log "Checking pg_hba.conf auth rules"
  psql_as_superuser postgres -P pager=off -c "select type,database,user_name,address,auth_method from pg_hba_file_rules order by line_number;" || warn "Could not read pg_hba_file_rules"

  log "Checking local socket auth with DATABASE_URL user"
  PGPASSWORD="${DB_PASSWORD}" psql -X -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${DB_NAME}" -Atc "select current_user;" >/tmp/adisyum-local-auth.out 2>/tmp/adisyum-local-auth.err \
    && log "Local socket auth OK: $(cat /tmp/adisyum-local-auth.out)" \
    || warn "Local socket auth failed: $(cat /tmp/adisyum-local-auth.err)"

  log "Checking TCP auth with DATABASE_URL user"
  PGPASSWORD="${DB_PASSWORD}" psql -X -v ON_ERROR_STOP=1 -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -Atc "select current_user;" >/tmp/adisyum-tcp-auth.out 2>/tmp/adisyum-tcp-auth.err \
    && log "TCP auth OK: $(cat /tmp/adisyum-tcp-auth.out)" \
    || fail "TCP auth failed: $(cat /tmp/adisyum-tcp-auth.err)"
else
  warn "psql not installed; skipping role/db/pg_hba checks"
fi

if command -v docker >/dev/null 2>&1; then
  log "Docker postgres containers:"
  docker ps --format '{{.Names}} {{.Image}} {{.Ports}}' | grep -Ei 'postgres|postgis' || log "No running postgres-like Docker containers detected"
else
  log "Docker command not available; container mismatch check skipped"
fi

cd "${APP_DIR}"
if [[ -f package.json ]]; then
  npm run db:test-connection
fi

log "PostgreSQL auth diagnostic completed"
