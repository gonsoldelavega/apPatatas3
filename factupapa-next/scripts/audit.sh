#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
api="${root}/apps/api"
web="${root}/apps/web"
infra="${root}/infrastructure"
artifacts="${RUNNER_TEMP:-/tmp}/factupapa-operational-artifacts"
current_phase="inicio"

phase() {
  current_phase="$1"
  printf '\n===== AUDIT PHASE: %s =====\n' "$1"
}

report_failure() {
  local status="$1" line="$2"
  trap - ERR
  printf '::error title=FactuPapa audit failed::phase=%s line=%s exit=%s\n' "${current_phase}" "${line}" "${status}"
  exit "${status}"
}
trap 'report_failure "$?" "${LINENO}"' ERR

compose() {
  (cd "${infra}" && docker compose "$@")
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  phase "cleanup final"
  compose down -v --remove-orphans
  rm -f "${infra}/.env" "${infra}/docker-compose.integration.yml"
  if [ "${PRESERVE_AUDIT_ARTIFACTS:-0}" != "1" ]; then
    rm -rf "${web}/test-artifacts" "${web}/test-results" "${web}/playwright-report" "${artifacts}"
  fi
  exit "${status}"
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "Falta la herramienta obligatoria: $1" >&2; exit 1; }
}

wait_for_healthy() {
  local service="$1" container_id="" status=""
  for _ in $(seq 1 60); do
    container_id="$(compose ps -a -q "${service}")"
    if [ -n "${container_id}" ]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container_id}")"
      if [ "${status}" = "healthy" ]; then echo "${service}: healthy"; return 0; fi
      if [ "${status}" = "unhealthy" ] || [ "${status}" = "exited" ] || [ "${status}" = "dead" ]; then
        echo "${service}: ${status}" >&2; return 1
      fi
    fi
    sleep 2
  done
  echo "Timeout esperando a ${service} (${status:-sin contenedor})" >&2
  return 1
}

sanitize_log() {
  local raw="$1" clean="$2"
  test -f "${raw}"
  node "${root}/scripts/sanitize-diagnostic-log.mjs" "${raw}" "${clean}" "${infra}/.env"
  rm -f "${raw}"
  test -s "${clean}"
}

phase "preflight y Docker rootless"
for tool in node npm docker curl openssl git; do require_command "${tool}"; done
test -n "${COMPOSE_PROJECT_NAME:-}"
case "${COMPOSE_PROJECT_NAME}" in *ci*|*audit*|*test*) ;; *) echo "Proyecto Compose no aislado" >&2; exit 1;; esac
docker info --format '{{json .SecurityOptions}}' | grep -q 'name=rootless'
docker compose version

phase "validación API"
(
  cd "${api}"
  export APP_ENV=integration
  export DATABASE_URL='postgresql://factupapa_api:fictitious-api-password-2026@postgres:5432/factupapa_next'
  export DATABASE_ADMIN_URL='postgresql://factupapa:fictitious-admin-password-2026@postgres:5432/factupapa_next'
  export JWT_SECRET='fictitious-integration-jwt-secret-with-more-than-sixty-four-characters-2026'
  export REDIS_URL='redis://:fictitious-redis-password-2026@redis:6379'
  export S3_ENDPOINT='http://minio:9000' S3_ACCESS_KEY='factupapa_storage' S3_SECRET_KEY='fictitious-object-password-2026'
  export CORS_ALLOWED_ORIGINS='http://127.0.0.1:4173'
  npm ci
  npm run config:check
  npm run typecheck
  npm test
  npm run build
)

phase "validación web"
(
  cd "${web}"
  npm ci
  npm run typecheck
  npm test
  npm run build
  npm exec -- playwright install chromium
)

phase "seguridad del repositorio"
! git grep -nE 'BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}' -- factupapa-next .github
path_scan_scope=(-- factupapa-next .github ':!factupapa-next/scripts/audit.sh' ':!factupapa-next/scripts/sanitize-diagnostic-log.mjs' ':!factupapa-next/apps/api/test/sanitize-log.test.ts')
! git grep -nE '/(Users|home|root|workspace)/' "${path_scan_scope[@]}"
! git grep -nEi '([A-Z]:\\Users\\|C:/Users/|\\Users\\)' "${path_scan_scope[@]}"

phase "entorno Compose ficticio"
umask 077
mkdir -p "${artifacts}"
chmod 700 "${artifacts}"
cp "${infra}/.env.example" "${infra}/.env"
postgres_password="$(openssl rand -hex 32)"
api_database_password="$(openssl rand -hex 32)"
redis_password="$(openssl rand -hex 32)"
minio_password="$(openssl rand -hex 32)"
jwt_secret="$(openssl rand -hex 64)"
metrics_token="$(openssl rand -hex 48)"
sed -i \
  -e "s|^APP_ENV=.*|APP_ENV=integration|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${postgres_password}|" \
  -e "s|^API_DATABASE_PASSWORD=.*|API_DATABASE_PASSWORD=${api_database_password}|" \
  -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${redis_password}|" \
  -e "s|^REDIS_URL=.*|REDIS_URL=redis://:${redis_password}@redis:6379|" \
  -e "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${minio_password}|" \
  -e "s|^DATABASE_ADMIN_URL=.*|DATABASE_ADMIN_URL=postgresql://factupapa:${postgres_password}@postgres:5432/factupapa_next|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://factupapa_api:${api_database_password}@postgres:5432/factupapa_next|" \
  -e "s|^S3_SECRET_KEY=.*|S3_SECRET_KEY=${minio_password}|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt_secret}|" \
  -e "s|^INTERNAL_METRICS_TOKEN=.*|INTERNAL_METRICS_TOKEN=${metrics_token}|" \
  -e "s|^INTERNAL_METRICS_ALLOW_REMOTE=.*|INTERNAL_METRICS_ALLOW_REMOTE=true|" \
  "${infra}/.env"
unset postgres_password api_database_password redis_password minio_password jwt_secret metrics_token
! grep -q 'CAMBIAR_' "${infra}/.env"
test "$(stat -c '%a' "${infra}/.env")" = "600"
printf 'networks:\n  factupapa:\n    name: %s_network\n' "${COMPOSE_PROJECT_NAME}" > "${infra}/docker-compose.integration.yml"
compose config --quiet
compose up --build -d
for service in postgres redis minio api web; do wait_for_healthy "${service}"; done

set -a
# shellcheck disable=SC1091
source "${infra}/.env"
set +a
host_database_admin_url="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"
host_database_url="postgresql://${API_DATABASE_USER}:${API_DATABASE_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}"

phase "integración PostgreSQL"
(cd "${api}" && DATABASE_ADMIN_URL="${host_database_admin_url}" DATABASE_URL="${host_database_url}" npm run test:integration)

phase "health, readiness y métricas"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:4100/health)" = "200"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:4100/ready)" = "200"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:4100/internal/metrics)" = "404"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' -H "X-Operations-Token: ${INTERNAL_METRICS_TOKEN}" http://127.0.0.1:4100/internal/metrics)" = "200"

phase "seed ficticio para smoke"
smoke_email="audit-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}@example.test"
smoke_password="$(openssl rand -base64 36 | tr -d '\n')"
APP_ENV=integration DEMO_USER_EMAIL="${smoke_email}" DEMO_USER_PASSWORD="${smoke_password}" \
  compose --profile tools run --build --rm -e APP_ENV -e DEMO_USER_EMAIL -e DEMO_USER_PASSWORD seed
phase "smoke web autenticado"
(
  cd "${web}"
  WEB_URL='http://127.0.0.1:4173' API_URL='http://127.0.0.1:4100' \
    SMOKE_EMAIL="${smoke_email}" SMOKE_PASSWORD="${smoke_password}" \
    SMOKE_PDF_PATH="${web}/test-artifacts/factura-ficticia.pdf" npm run smoke
  phase "Playwright completo"
  DEMO_USER_EMAIL="${smoke_email}" DEMO_USER_PASSWORD="${smoke_password}" \
    WEB_URL='http://127.0.0.1:4173' npx playwright test
)
unset smoke_email smoke_password

phase "cleanup de importaciones, backup y restore"
company_id="$(compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id from companies order by created_at limit 1"')"
user_id="$(compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id from users order by created_at limit 1"')"
(
  cd "${api}"
  DATABASE_URL="${host_database_url}" CLEANUP_COMPANY_ID="${company_id}" CLEANUP_USER_ID="${user_id}" timeout --foreground 60s npm run cleanup:imports -- --dry-run
  DATABASE_URL="${host_database_url}" CLEANUP_COMPANY_ID="${company_id}" CLEANUP_USER_ID="${user_id}" timeout --foreground 60s npm run cleanup:imports
  BACKUP_ENVIRONMENT=integration BACKUP_DIRECTORY="${artifacts}" timeout --foreground 120s npm run --silent backup:database > "${artifacts}/backup.raw.log"
)
compose run --rm --entrypoint sh create-buckets -c 'mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null; printf "%s" "fictitious-object" | mc pipe local/factupapa-documents/ci/fictitious.txt >/dev/null'
(cd "${api}" && S3_ENDPOINT="http://127.0.0.1:${MINIO_API_PORT}" OBJECT_BACKUP_DIRECTORY="${artifacts}/objects" timeout --foreground 120s npm run --silent backup:objects > "${artifacts}/objects.raw.log")
dump="$(node -e 'const fs=require("fs"); const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8").trim().split(/\n/).at(-1)); process.stdout.write(x.dump)' "${artifacts}/backup.raw.log")"
(cd "${api}" && RESTORE_DUMP="${dump}" RESTORE_ENVIRONMENT=integration RESTORE_TARGET=audit RESTORE_REPORT_DIRECTORY="${artifacts}" timeout --foreground 180s npm run --silent restore:verify -- --confirm-isolated-restore)
cp "${dump}" "${artifacts}/tampered.dump"
cp "${dump}.manifest.json" "${artifacts}/tampered.dump.manifest.json"
cp "${dump}.sha256" "${artifacts}/tampered.dump.sha256"
printf x >> "${artifacts}/tampered.dump"
if (cd "${api}" && RESTORE_DUMP="${artifacts}/tampered.dump" RESTORE_ENVIRONMENT=integration RESTORE_TARGET=tampered timeout --foreground 60s npm run --silent restore:verify -- --confirm-isolated-restore); then
  echo "Una copia manipulada fue aceptada" >&2; exit 1
fi
cp "${dump}" "${artifacts}/incomplete.dump"
if (cd "${api}" && RESTORE_DUMP="${artifacts}/incomplete.dump" RESTORE_ENVIRONMENT=integration RESTORE_TARGET=incomplete timeout --foreground 60s npm run --silent restore:verify -- --confirm-isolated-restore); then
  echo "Una copia incompleta fue aceptada" >&2; exit 1
fi
if (cd "${api}" && BACKUP_ENVIRONMENT='INVALID!' BACKUP_DIRECTORY="${artifacts}/invalid" timeout --foreground 30s npm run --silent backup:database); then
  echo "El fallo controlado de backup no fue detectado" >&2; exit 1
fi
cp "${dump}.manifest.json" "${artifacts}/database-backup.manifest.json"
find "${artifacts}/objects" -name manifest.json -exec cp {} "${artifacts}/object-backup.manifest.json" \;
rm -f "${artifacts}"/*.dump "${artifacts}"/*.dump.manifest.json "${artifacts}"/*.dump.sha256
rm -rf "${artifacts}/objects"

phase "fallos controlados y recuperación de dependencias"
for dependency in redis minio postgres; do
  compose stop "${dependency}"
  status=""
  for _ in $(seq 1 15); do status="$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:4100/ready || true)"; [ "${status}" = "503" ] && break; sleep 1; done
  test "${status}" = "503"
  compose start "${dependency}"
  for _ in $(seq 1 30); do status="$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:4100/ready || true)"; [ "${status}" = "200" ] && break; sleep 1; done
  test "${status}" = "200"
done
compose logs --no-color api > "${artifacts}/api.raw.log"

phase "recuperación destructiva"
export DEMO_USER_EMAIL="recovery-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}@example.test"
export DEMO_USER_PASSWORD="$(openssl rand -base64 36 | tr -d '\n')"
"${root}/scripts/disaster-recovery.sh" > "${artifacts}/recovery.raw.log"
unset DEMO_USER_EMAIL DEMO_USER_PASSWORD

phase "sanitización de logs"
sanitize_log "${artifacts}/api.raw.log" "${artifacts}/api-sanitized.log"
sanitize_log "${artifacts}/backup.raw.log" "${artifacts}/backup-sanitized.log"
sanitize_log "${artifacts}/objects.raw.log" "${artifacts}/objects-sanitized.log"
sanitize_log "${artifacts}/recovery.raw.log" "${artifacts}/recovery-sanitized.log"
test -z "$(find "${artifacts}" -type f \( -name '*.raw.log' -o -name '*.dump' -o -name '*.sha256' \) -print -quit)"
for clean in "${artifacts}"/*-sanitized.log; do
  ! grep -Eqi 'authorization|Bearer [A-Za-z0-9]|factupapa_refresh=[^[]|password|accessToken|refreshToken|postgres(ql)?://[^[]+@|/(Users|home|root|workspace)/|[A-Za-z]:\\Users\\' "${clean}"
  for name in DATABASE_URL DATABASE_ADMIN_URL REDIS_URL POSTGRES_PASSWORD API_DATABASE_PASSWORD REDIS_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY JWT_SECRET INTERNAL_METRICS_TOKEN; do
    value="${!name:-}"
    if [ "${#value}" -ge 8 ] && grep -Fq -- "${value}" "${clean}"; then
      echo "El log sanitizado conserva ${name}" >&2
      exit 1
    fi
  done
done
for clean in "${artifacts}"/*-sanitized.log; do cat "${clean}"; done

phase "ausencia final de recursos"
compose down -v --remove-orphans
test -z "$(docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}")"
test -z "$(docker volume ls -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}")"
test -z "$(docker network ls -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}")"
echo '{"status":"audit_verified","data":"fictitious","containersRemaining":0,"networksRemaining":0,"volumesRemaining":0}'
