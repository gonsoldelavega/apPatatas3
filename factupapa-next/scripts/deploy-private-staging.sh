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
test -f "${environment_file}" || { echo "Falta el entorno privado persistente" >&2; exit 1; }
test -f "${override_file}" || { echo "Falta la configuración privada de staging" >&2; exit 1; }
test "$(stat -c '%a' "${environment_file}")" = "600" || { echo "Los permisos del entorno privado no son 600" >&2; exit 1; }
git -C "${repository}" diff --quiet || { echo "Hay cambios versionados sin auditar" >&2; exit 1; }
git -C "${repository}" diff --cached --quiet || { echo "Hay cambios versionados preparados sin auditar" >&2; exit 1; }

upsert_private_environment_value "OWN_TAX_IDS" "${FACTUPAPA_OWN_TAX_IDS}"
upsert_private_environment_value "ANTHROPIC_API_KEY" "${FACTUPAPA_ANTHROPIC_API_KEY}"
upsert_private_environment_value "GOOGLE_OAUTH_CLIENT_ID" "${FACTUPAPA_GOOGLE_OAUTH_CLIENT_ID}"
upsert_private_environment_value "GOOGLE_OAUTH_CLIENT_SECRET" "${FACTUPAPA_GOOGLE_OAUTH_CLIENT_SECRET}"
upsert_private_environment_value "GOOGLE_OAUTH_REDIRECT_URI" "https://ubuntu-4gb-hel1-1.tail6dd682.ts.net/api/auth/google/callback"
upsert_private_environment_value "GOOGLE_OAUTH_FRONTEND_URL" "https://ubuntu-4gb-hel1-1.tail6dd682.ts.net"
upsert_private_environment_value "CORS_ALLOWED_ORIGINS" "https://ubuntu-4gb-hel1-1.tail6dd682.ts.net"
upsert_private_environment_value "AUTH_COOKIE_SECURE" "true"
upsert_private_environment_value "AUTH_COOKIE_PATH" "/api/auth"
upsert_private_environment_value "WEB_API_BASE_URL" "/api"
upsert_private_environment_value "PURCHASE_REGISTRY_WEBAPP_URL" "https://docs.google.com/spreadsheets/d/1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU/gviz/tq?tqx=out:csv&sheet=REGISTRO"
unset FACTUPAPA_OWN_TAX_IDS FACTUPAPA_ANTHROPIC_API_KEY FACTUPAPA_GOOGLE_OAUTH_CLIENT_ID FACTUPAPA_GOOGLE_OAUTH_CLIENT_SECRET

export COMPOSE_PROJECT_NAME=factupapa_staging
export COMPOSE_FILE="${infrastructure}/docker-compose.yml:${override_file}"
set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a

test "${CORS_ALLOWED_ORIGINS}" = "https://ubuntu-4gb-hel1-1.tail6dd682.ts.net"
test "${AUTH_COOKIE_SECURE}" = "true"
test "${AUTH_COOKIE_PATH}" = "/api/auth"
test "${WEB_API_BASE_URL}" = "/api"

echo "Creando copia verificada previa al despliegue"
(
  cd "${repository}/factupapa-next/apps/api"
  npm ci --no-audit --no-fund >/dev/null
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
docker compose config --quiet
docker compose build
docker compose up -d

for service in postgres redis minio api web; do
  healthy=""
  for _ in $(seq 1 60); do
    container="$(docker compose ps -q "${service}")"
    if [ -n "${container}" ]; then
      healthy="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}")"
      [ "${healthy}" = "healthy" ] && break
      case "${healthy}" in unhealthy|exited|dead) break ;; esac
    fi
    sleep 2
  done
  test "${healthy}" = "healthy"
done

test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:14100/health)" = "200"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:14100/ready)" = "200"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:14173/healthz)" = "200"
test "$(docker ps -q --filter 'label=com.docker.compose.project=n8n')" = ""
echo "Staging privado actualizado al SHA ${expected_sha}"
