#!/usr/bin/env bash
set -Eeuo pipefail

staging_root="${HOME}/staging"
repository="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
infrastructure="${repository}/factupapa-next/infrastructure"
environment_file="${staging_root}/repo/factupapa-next/infrastructure/.env"
override_file="${staging_root}/docker-compose.staging.yml"
backup_directory="${staging_root}/backups"
expected_sha="${GITHUB_SHA:?GITHUB_SHA is required}"
branch="${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
public_host="factupapa-next.46-62-226-95.sslip.io"
public_origin="https://${public_host}"
# shellcheck disable=SC1091
source "${repository}/factupapa-next/scripts/deploy-runtime-ports.sh"

case "${branch}" in
  design/factupapa-full-prototype|codex/factupapa-claude-fixes) ;;
  *) echo "Rama no autorizada para el staging privado: ${branch}" >&2; exit 1 ;;
esac

: "${FACTUPAPA_OWN_TAX_IDS:?FACTUPAPA_OWN_TAX_IDS secret is required}"
: "${FACTUPAPA_ANTHROPIC_API_KEY:?FACTUPAPA_ANTHROPIC_API_KEY secret is required}"
: "${FACTUPAPA_GOOGLE_OAUTH_CLIENT_ID:?FACTUPAPA_GOOGLE_OAUTH_CLIENT_ID secret is required}"
: "${FACTUPAPA_GOOGLE_OAUTH_CLIENT_SECRET:?FACTUPAPA_GOOGLE_OAUTH_CLIENT_SECRET secret is required}"

upsert_private_environment_value() {
  local key="$1"
  local value="$2"
  local temporary_file

  case "${value}" in
    *$'\n'*|*$'\r'*) echo "Valor privado no válido para ${key}" >&2; exit 1 ;;
  esac

  temporary_file="$(mktemp "$(dirname "${environment_file}")/.env.deploy.XXXXXX")"
  chmod 600 "${temporary_file}"
  awk -v key="${key}" -v value="${value}" '
    index($0, key "=") == 1 {
      if (!updated) print key "=" value
      updated = 1
      next
    }
    { print }
    END { if (!updated) print key "=" value }
  ' "${environment_file}" >"${temporary_file}"
  mv "${temporary_file}" "${environment_file}"
  chmod 600 "${environment_file}"
}

ensure_private_environment_value() {
  local key="$1" value="$2"
  grep -q "^${key}=" "${environment_file}" 2>/dev/null || upsert_private_environment_value "${key}" "${value}"
}

for command in docker git curl node npm; do
  command -v "${command}" >/dev/null || { echo "Falta el comando requerido: ${command}" >&2; exit 1; }
done

lock_directory="${RUNNER_TEMP:-/tmp}/factupapa-staging-deploy.lock"
mkdir "${lock_directory}" 2>/dev/null || { echo "Otro despliegue de staging está en curso" >&2; exit 1; }
trap 'rmdir "${lock_directory}" 2>/dev/null || true' EXIT

test "$(id -u)" = "1001" || { echo "El despliegue no se ejecuta con el usuario rootless esperado" >&2; exit 1; }
test "${DOCKER_HOST:-}" = "unix:///run/user/1001/docker.sock" || { echo "Docker rootless no está configurado" >&2; exit 1; }
docker info --format '{{json .SecurityOptions}}' | grep -q 'name=rootless' || { echo "Docker no está en modo rootless" >&2; exit 1; }
test -d "${repository}/.git" || { echo "Checkout de Actions no disponible" >&2; exit 1; }
test "$(git -C "${repository}" rev-parse HEAD)" = "${expected_sha}" || { echo "El checkout no coincide con el SHA auditado" >&2; exit 1; }
environment_needs_bootstrap=0
if [ ! -f "${environment_file}" ]; then
  environment_needs_bootstrap=1
else
  for required_key in DATABASE_URL DATABASE_ADMIN_URL API_DATABASE_USER API_DATABASE_PASSWORD POSTGRES_DB POSTGRES_PASSWORD POSTGRES_USER JWT_SECRET REDIS_URL REDIS_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY; do
    grep -q "^${required_key}=" "${environment_file}" || environment_needs_bootstrap=1
  done
fi
if [ "${environment_needs_bootstrap}" = "1" ]; then
  # Recover the private runtime envelope from the existing staging container.
  # The runner checkout is ephemeral, while the rootless Compose project is
  # persistent; keeping this bootstrap here avoids a false deploy failure when
  # the protected env file was lost during runner maintenance.
  api_container="$(docker ps -q --filter 'label=com.docker.compose.project=factupapa_staging' --filter 'label=com.docker.compose.service=api' | head -n 1)"
  postgres_container="$(docker ps -q --filter 'label=com.docker.compose.project=factupapa_staging' --filter 'label=com.docker.compose.service=postgres' | head -n 1)"
  redis_container="$(docker ps -q --filter 'label=com.docker.compose.project=factupapa_staging' --filter 'label=com.docker.compose.service=redis' | head -n 1)"
  minio_container="$(docker ps -q --filter 'label=com.docker.compose.project=factupapa_staging' --filter 'label=com.docker.compose.service=minio' | head -n 1)"
  test -n "${api_container}" -a -n "${postgres_container}" -a -n "${redis_container}" -a -n "${minio_container}" || {
    echo "Falta el entorno privado persistente y no hay staging recuperable" >&2; exit 1;
  }
  mkdir -p "$(dirname "${environment_file}")"
  temporary_file="$(mktemp "$(dirname "${environment_file}")/.env.bootstrap.XXXXXX")"
  chmod 600 "${temporary_file}"
  API_CONTAINER="${api_container}" POSTGRES_CONTAINER="${postgres_container}" REDIS_CONTAINER="${redis_container}" MINIO_CONTAINER="${minio_container}" OUT="${temporary_file}" node - <<'NODE'
const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const api = execFileSync("docker", ["inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", process.env.API_CONTAINER], { encoding: "utf8" });
const postgres = execFileSync("docker", ["inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", process.env.POSTGRES_CONTAINER], { encoding: "utf8" });
const redis = execFileSync("docker", ["inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", process.env.REDIS_CONTAINER], { encoding: "utf8" });
const minio = execFileSync("docker", ["inspect", "-f", "{{range .Config.Env}}{{println .}}{{end}}", process.env.MINIO_CONTAINER], { encoding: "utf8" });
const values = new Map();
for (const line of `${api}${postgres}${redis}${minio}`.split(/\r?\n/)) {
  const index = line.indexOf("=");
  if (index > 0) values.set(line.slice(0, index), line.slice(index + 1));
}
const databaseUrl = values.get("DATABASE_URL");
if (!databaseUrl) throw new Error("staging_env_bootstrap_missing:DATABASE_URL");
if (!values.has("DATABASE_ADMIN_URL")) {
  const db = new URL(databaseUrl);
  const pgUser = values.get("POSTGRES_USER");
  const pgPassword = values.get("POSTGRES_PASSWORD");
  if (!pgUser || !pgPassword) throw new Error("staging_env_bootstrap_missing:postgres");
  db.username = pgUser;
  db.password = pgPassword;
  values.set("DATABASE_ADMIN_URL", db.toString());
}
const database = new URL(databaseUrl);
if (!values.has("API_DATABASE_USER")) values.set("API_DATABASE_USER", decodeURIComponent(database.username));
if (!values.has("API_DATABASE_PASSWORD")) values.set("API_DATABASE_PASSWORD", decodeURIComponent(database.password));
const redisUrl = values.get("REDIS_URL");
if (redisUrl && !values.has("REDIS_PASSWORD")) values.set("REDIS_PASSWORD", decodeURIComponent(new URL(redisUrl).password));
if (!values.has("MINIO_ROOT_USER") && values.has("S3_ACCESS_KEY")) values.set("MINIO_ROOT_USER", values.get("S3_ACCESS_KEY"));
if (!values.has("MINIO_ROOT_PASSWORD") && values.has("S3_SECRET_KEY")) values.set("MINIO_ROOT_PASSWORD", values.get("S3_SECRET_KEY"));
const required = ["DATABASE_URL", "DATABASE_ADMIN_URL", "API_DATABASE_USER", "API_DATABASE_PASSWORD", "POSTGRES_DB", "POSTGRES_PASSWORD", "POSTGRES_USER", "JWT_SECRET", "REDIS_URL", "REDIS_PASSWORD", "MINIO_ROOT_USER", "MINIO_ROOT_PASSWORD", "S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
for (const key of required) if (!values.get(key)) throw new Error(`staging_env_bootstrap_missing:${key}`);
const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
const output = [...values].filter(([key]) => /^[A-Z][A-Z0-9_]*$/.test(key)).map(([key, value]) => `${key}=${shellQuote(value)}`).join("\n") + "\n";
writeFileSync(process.env.OUT, output, { mode: 0o600 });
NODE
  mv "${temporary_file}" "${environment_file}"
fi
unset environment_needs_bootstrap
test -f "${environment_file}" || { echo "Falta el entorno privado persistente" >&2; exit 1; }
test -f "${override_file}" || { echo "Falta la configuración privada de staging" >&2; exit 1; }
test "$(stat -c '%a' "${environment_file}")" = "600" || { echo "Los permisos del entorno privado no son 600" >&2; exit 1; }
git -C "${repository}" diff --quiet || { echo "Hay cambios versionados sin auditar" >&2; exit 1; }
git -C "${repository}" diff --cached --quiet || { echo "Hay cambios versionados preparados sin auditar" >&2; exit 1; }

upsert_private_environment_value "OWN_TAX_IDS" "${FACTUPAPA_OWN_TAX_IDS}"
upsert_private_environment_value "ANTHROPIC_API_KEY" "${FACTUPAPA_ANTHROPIC_API_KEY}"
upsert_private_environment_value "GOOGLE_OAUTH_CLIENT_ID" "${FACTUPAPA_GOOGLE_OAUTH_CLIENT_ID}"
upsert_private_environment_value "GOOGLE_OAUTH_CLIENT_SECRET" "${FACTUPAPA_GOOGLE_OAUTH_CLIENT_SECRET}"
upsert_private_environment_value "PUBLIC_HOST" "${public_host}"
upsert_private_environment_value "PUBLIC_BIND_ADDRESS" "0.0.0.0"
upsert_private_environment_value "GOOGLE_OAUTH_REDIRECT_URI" "${public_origin}/api/auth/google/callback"
upsert_private_environment_value "GOOGLE_OAUTH_FRONTEND_URL" "${public_origin}"
upsert_private_environment_value "CORS_ALLOWED_ORIGINS" "${public_origin}"
upsert_private_environment_value "AUTH_COOKIE_SECURE" "true"
upsert_private_environment_value "AUTH_COOKIE_PATH" "/api/auth"
upsert_private_environment_value "WEB_API_BASE_URL" "/api"
upsert_private_environment_value "APP_VERSION" "${expected_sha}"
upsert_private_environment_value "PURCHASE_REGISTRY_WEBAPP_URL" "https://docs.google.com/spreadsheets/d/1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU/gviz/tq?tqx=out:csv&sheet=REGISTRO"
unset FACTUPAPA_OWN_TAX_IDS FACTUPAPA_ANTHROPIC_API_KEY FACTUPAPA_GOOGLE_OAUTH_CLIENT_ID FACTUPAPA_GOOGLE_OAUTH_CLIENT_SECRET

# Compose defaults are made explicit in the protected runtime envelope so all
# deploy and recovery checks consume the same host-port source of truth.
ensure_private_environment_value "APP_PORT" "4100"
ensure_private_environment_value "WEB_PORT" "4173"

export COMPOSE_PROJECT_NAME=factupapa_staging
export COMPOSE_FILE="${infrastructure}/docker-compose.yml:${override_file}"
runtime_path="${PATH}"
set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a
export PATH="${runtime_path}"
unset runtime_path

validate_runtime_ports

test "${PUBLIC_HOST}" = "${public_host}"
test "${PUBLIC_BIND_ADDRESS}" = "0.0.0.0"
test "${CORS_ALLOWED_ORIGINS}" = "${public_origin}"
test "${AUTH_COOKIE_SECURE}" = "true"
test "${AUTH_COOKIE_PATH}" = "/api/auth"
test "${WEB_API_BASE_URL}" = "/api"
test "${APP_VERSION}" = "${expected_sha}"

# Build the audited images before the isolated restore verification.  That
# verification starts the migration image; using the previously cached image
# would validate an older migration manifest and fail before the new image
# could be built below.
cd "${infrastructure}"
docker compose --profile public config --quiet
docker compose build --no-cache
cd - >/dev/null

echo "Creando copia verificada previa al despliegue"
(
  cd "${repository}/factupapa-next/apps/api"
  npm ci --include=dev --no-audit --no-fund >/dev/null
  backup_result="$(
    BACKUP_ENVIRONMENT=staging BACKUP_DIRECTORY="${backup_directory}" \
      BACKUP_MAX_COPIES=14 BACKUP_MAX_AGE_DAYS=30 npm run --silent backup:database
  )"
  backup_dump="$(
    BACKUP_RESULT="${backup_result}" node -e '
      const rows = process.env.BACKUP_RESULT.trim().split(/\n/);
      const value = JSON.parse(rows.at(-1));
      if (value.status !== "verified" || typeof value.dump !== "string") process.exit(1);
      process.stdout.write(value.dump);
    '
  )"
  RESTORE_DUMP="${backup_dump}" RESTORE_ENVIRONMENT=staging \
    RESTORE_TARGET=predeploy RESTORE_REPORT_DIRECTORY="${backup_directory}" \
    npm run --silent restore:verify -- --confirm-isolated-restore >/dev/null
  unset backup_result backup_dump
)

cd "${infrastructure}"
docker compose --profile public config --quiet
if ! docker compose --profile public up -d; then
  echo "El despliegue no pudo completar sus servicios; mostrando diagnóstico seguro" >&2
  docker compose --profile public logs --no-color --tail=100 provision-api-role >&2 || true
  # Compose ya ha creado las nuevas unidades. Arrancarlas sin volver a evaluar
  # dependencias mantiene disponible el acceso mientras se conserva el fallo.
  for service in api web caddy; do
    recovery_container="$(docker compose --profile public ps -aq "${service}")"
    [ -z "${recovery_container}" ] || docker start "${recovery_container}" >/dev/null || true
  done
  exit 1
fi

for service in postgres redis minio api web caddy; do
  healthy=""
  for _ in $(seq 1 60); do
    container="$(docker compose --profile public ps -q "${service}")"
    if [ -n "${container}" ]; then
      healthy="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}")"
      [ "${healthy}" = "healthy" ] && break
      case "${healthy}" in unhealthy|exited|dead) break ;; esac
    fi
    sleep 2
  done
  test "${healthy}" = "healthy"
done

api_health_url="$(api_local_url health)"
api_ready_url="$(api_local_url ready)"
web_health_url="$(web_local_url healthz)"
test "$(docker compose --profile public port api 4100 | sed -E 's/.*://')" = "${APP_PORT}"
test "$(docker compose --profile public port web 4173 | sed -E 's/.*://')" = "${WEB_PORT}"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${api_health_url}")" = "200"
test "$(curl --silent --show-error "${api_health_url}" | node -e '
  let input = "";
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    const body = JSON.parse(input);
    if (body.version !== process.env.GITHUB_SHA) process.exit(1);
  });
')" = ""
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${api_ready_url}")" = "200"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${web_health_url}")" = "200"

public_status=""
for _ in $(seq 1 90); do
  public_status="$(
    curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      "${public_origin}/healthz" || true
  )"
  [ "${public_status}" = "200" ] && break
  sleep 2
done
test "${public_status}" = "200"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${public_origin}/api/health")" = "200"
test "$(docker ps -q --filter 'label=com.docker.compose.project=n8n')" = ""
echo "FactuPapa Next publicado en ${public_origin} con el SHA ${expected_sha}"
