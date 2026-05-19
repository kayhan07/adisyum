#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.production}"
POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-postgres}"

log() {
  printf '[%s] %s\n' "$(date -Is)" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

load_env() {
  cd "${APP_DIR}"
  if [[ -f ".env" ]]; then set -a; source ".env"; set +a; fi
  if [[ -f "${ENV_FILE}" ]]; then set -a; source "${ENV_FILE}"; set +a; fi
  if [[ -f ".env.local" ]]; then set -a; source ".env.local"; set +a; fi
}

parse_database_url() {
  [[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL missing"
  command -v node >/dev/null 2>&1 || fail "node is required"
  local parsed
  parsed="$(node -e '
const raw = process.env.DATABASE_URL;
const u = new URL(raw);
for (const [k, v] of Object.entries({
  DB_HOST: u.hostname || "127.0.0.1",
  DB_PORT: u.port || "5432",
  DB_NAME: decodeURIComponent(u.pathname.replace(/^\//, "")),
  DB_USER: decodeURIComponent(u.username || ""),
  DB_PASSWORD: decodeURIComponent(u.password || ""),
})) console.log(`${k}=${JSON.stringify(v)}`);
')" || fail "DATABASE_URL parse failed"
  eval "${parsed}"
  [[ -n "${DB_NAME}" ]] || fail "DATABASE_URL database name missing"
  [[ -n "${DB_USER}" ]] || fail "DATABASE_URL user missing"
  [[ -n "${DB_PASSWORD}" ]] || fail "DATABASE_URL password missing; refusing unsafe password reset"
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

sql_literal() {
  local value="$1"
  printf "%s" "${value//\'/\'\'}"
}

sql_identifier() {
  local value="$1"
  printf "%s" "${value//\"/\"\"}"
}

load_env
parse_database_url

command -v psql >/dev/null 2>&1 || fail "psql is required"

log "Repairing PostgreSQL role safely for database=${DB_NAME} user=${DB_USER}"
log "This script never drops databases, schemas, or production data."

psql_as_superuser postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$(sql_literal "${DB_USER}")') THEN
    CREATE ROLE "$(sql_identifier "${DB_USER}")" LOGIN PASSWORD '$(sql_literal "${DB_PASSWORD}")';
  ELSE
    ALTER ROLE "$(sql_identifier "${DB_USER}")" WITH LOGIN PASSWORD '$(sql_literal "${DB_PASSWORD}")';
  END IF;
END
\$\$;
SQL
log "Role create/reset complete"

local_db_exists="$(psql_as_superuser postgres -Atc "select 1 from pg_database where datname = '$(sql_literal "${DB_NAME}")';" 2>/dev/null || true)"
if [[ "${local_db_exists}" != "1" ]]; then
  log "Database ${DB_NAME} does not exist; creating owner=${DB_USER}"
  psql_as_superuser postgres -c "CREATE DATABASE \"$(sql_identifier "${DB_NAME}")\" OWNER \"$(sql_identifier "${DB_USER}")\";"
else
  log "Database exists: ${DB_NAME}"
fi

psql_as_superuser postgres -c "ALTER DATABASE \"$(sql_identifier "${DB_NAME}")\" OWNER TO \"$(sql_identifier "${DB_USER}")\";"
psql_as_superuser "${DB_NAME}" <<SQL
GRANT CONNECT ON DATABASE "$(sql_identifier "${DB_NAME}")" TO "$(sql_identifier "${DB_USER}")";
GRANT USAGE, CREATE ON SCHEMA public TO "$(sql_identifier "${DB_USER}")";
ALTER SCHEMA public OWNER TO "$(sql_identifier "${DB_USER}")";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "$(sql_identifier "${DB_USER}")";
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "$(sql_identifier "${DB_USER}")";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO "$(sql_identifier "${DB_USER}")";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO "$(sql_identifier "${DB_USER}")";
SQL
log "Database ownership and schema grants complete"

PGPASSWORD="${DB_PASSWORD}" psql -X -v ON_ERROR_STOP=1 -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -Atc "select current_user || '@' || current_database();" \
  | sed 's/^/[postgres-auth] /'

cd "${APP_DIR}"
npm run db:test-connection

log "PostgreSQL role repair completed"
