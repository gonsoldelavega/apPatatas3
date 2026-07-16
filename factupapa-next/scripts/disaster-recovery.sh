#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
infra="${root}/infrastructure"
api="${root}/apps/api"
web="${root}/apps/web"
recovery_dir="${RUNNER_TEMP:-/tmp}/factupapa-recovery-${COMPOSE_PROJECT_NAME:-unknown}"

case "${COMPOSE_PROJECT_NAME:-}" in
  *ci*|*recovery*|*test*) ;;
  *) echo "COMPOSE_PROJECT_NAME debe identificar un proyecto aislado de CI/recovery" >&2; exit 1 ;;
esac
test "${APP_ENV:-integration}" != "production"
test -n "${DEMO_USER_EMAIL:-}"
test -n "${DEMO_USER_PASSWORD:-}"

cleanup() {
  (cd "${infra}" && docker compose down -v --remove-orphans) >/dev/null 2>&1 || true
  rm -rf "${recovery_dir}"
}
trap cleanup EXIT

cd "${infra}"
docker compose up --build -d

APP_ENV=integration docker compose --profile tools run --build --rm \
  -e APP_ENV -e DEMO_USER_EMAIL -e DEMO_USER_PASSWORD seed

WEB_URL="http://127.0.0.1:${WEB_PORT:-4173}" \
API_URL="http://127.0.0.1:${APP_PORT:-4100}" \
SMOKE_EMAIL="${DEMO_USER_EMAIL}" SMOKE_PASSWORD="${DEMO_USER_PASSWORD}" \
SMOKE_PDF_PATH="${web}/test-artifacts/recovery-before.pdf" \
npm --prefix "${web}" run smoke

before="$(docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select json_build_object('\''companies'\'',(select count(*) from companies),'\''contacts'\'',(select count(*) from contacts),'\''products'\'',(select count(*) from products),'\''deliveryNotes'\'',(select count(*) from delivery_notes),'\''invoices'\'',(select count(*) from invoices),'\''sequences'\'',(select count(*) from document_sequences),'\''audit'\'',(select count(*) from audit_events))"')"

mkdir -p "${recovery_dir}"
backup_json="$(cd "${api}" && BACKUP_ENVIRONMENT=integration BACKUP_DIRECTORY="${recovery_dir}" npm run --silent backup:database | tail -n 1)"
dump="$(node -e 'const value=JSON.parse(process.argv[1]); if(value.status!=="verified") process.exit(1); process.stdout.write(value.dump)' "${backup_json}")"

cd "${api}"
RESTORE_DUMP="${dump}" RESTORE_ENVIRONMENT=integration RESTORE_TARGET=preflight \
RESTORE_REPORT_DIRECTORY="${recovery_dir}" npm run --silent restore:verify -- --confirm-isolated-restore

cd "${infra}"
docker compose down -v --remove-orphans
docker compose up -d postgres
for _ in $(seq 1 60); do docker compose exec -T postgres pg_isready -U "${POSTGRES_USER}" -d postgres >/dev/null 2>&1 && break; sleep 1; done
docker compose up --build migrate provision-api-role
docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" dropdb --if-exists --force --no-password -U "$POSTGRES_USER" "$POSTGRES_DB" && PGPASSWORD="$POSTGRES_PASSWORD" createdb --no-password -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore --exit-on-error --no-password --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' < "${dump}"
docker compose run --rm migrate
docker compose up --build -d

for _ in $(seq 1 60); do curl --fail --silent "http://127.0.0.1:${APP_PORT:-4100}/ready" >/dev/null 2>&1 && break; sleep 2; done
curl --fail --silent "http://127.0.0.1:${APP_PORT:-4100}/ready" >/dev/null
after="$(docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select json_build_object('\''companies'\'',(select count(*) from companies),'\''contacts'\'',(select count(*) from contacts),'\''products'\'',(select count(*) from products),'\''deliveryNotes'\'',(select count(*) from delivery_notes),'\''invoices'\'',(select count(*) from invoices),'\''sequences'\'',(select count(*) from document_sequences),'\''audit'\'',(select count(*) from audit_events))"')"
test "${before}" = "${after}"

company_id="$(docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id from companies order by created_at limit 1"')"
user_id="$(docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql --no-psqlrc -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id from users order by created_at limit 1"')"
if PGPASSWORD="${API_DATABASE_PASSWORD}" docker compose exec -T -e PGPASSWORD postgres psql --no-psqlrc -v ON_ERROR_STOP=1 -U "${API_DATABASE_USER}" -d "${POSTGRES_DB}" -c "begin; set local app.current_company_id='${company_id}'; set local app.current_user_id='${user_id}'; update invoices set notes='mutation forbidden' where status='issued';" >/dev/null 2>&1; then
  echo "La inmutabilidad no bloqueó una factura emitida" >&2; exit 1
fi

WEB_URL="http://127.0.0.1:${WEB_PORT:-4173}" API_URL="http://127.0.0.1:${APP_PORT:-4100}" \
SMOKE_EMAIL="${DEMO_USER_EMAIL}" SMOKE_PASSWORD="${DEMO_USER_PASSWORD}" \
SMOKE_PDF_PATH="${web}/test-artifacts/recovery-after.pdf" npm --prefix "${web}" run smoke

docker compose down -v --remove-orphans
test -z "$(docker compose ps -aq)"
test -z "$(docker volume ls -q --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}")"
rm -rf "${recovery_dir}"
trap - EXIT
echo '{"status":"recovery_verified","data":"fictitious","servicesRemaining":0,"volumesRemaining":0}'
