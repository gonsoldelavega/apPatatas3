#!/usr/bin/env bash
set -Eeuo pipefail

backup_file="${HOME}/private-import/legacy-backup.json"
environment_file="${HOME}/staging/repo/factupapa-next/infrastructure/.env"
override_file="${HOME}/staging/docker-compose.staging.yml"
repository="${1:-${GITHUB_WORKSPACE:-}}"
owner_email="${IMPORT_USER_EMAIL:-}"
apply_import="${LEGACY_IMPORT_APPLY:-0}"
backup_payload="${LEGACY_BACKUP_GZIP_BASE64:-}"

[ -n "${repository}" ] || { echo "Indica la ruta del repositorio desplegable" >&2; exit 1; }
[ -n "${owner_email}" ] || { echo "Define IMPORT_USER_EMAIL" >&2; exit 1; }
case "${apply_import}" in
  0|1) ;;
  *) echo "LEGACY_IMPORT_APPLY solo admite 0 o 1" >&2; exit 1 ;;
esac
if [ -z "${backup_payload}" ]; then
  [ -f "${backup_file}" ] || { echo "No existe ${backup_file}" >&2; exit 1; }
  [ "$(stat -c '%a' "${backup_file}")" = "600" ] || { echo "El backup debe tener permisos 600" >&2; exit 1; }
fi

stream_backup() {
  if [ -n "${backup_payload}" ]; then
    printf '%s' "${backup_payload}" | base64 -d | gzip -dc
  else
    cat "${backup_file}"
  fi
}

backup_sha256="$(stream_backup | sha256sum | cut -d ' ' -f 1)"
echo "Backup histórico SHA-256: ${backup_sha256}"
[ -f "${environment_file}" ] || { echo "No existe el entorno privado persistente" >&2; exit 1; }
[ -f "${override_file}" ] || { echo "No existe el override de staging" >&2; exit 1; }
[ -f "${repository}/factupapa-next/infrastructure/docker-compose.yml" ] || { echo "Repositorio no válido" >&2; exit 1; }

export COMPOSE_PROJECT_NAME=factupapa_staging
export COMPOSE_FILE="${repository}/factupapa-next/infrastructure/docker-compose.yml:${override_file}"
set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a

run_import() {
  docker compose --profile tools build --quiet bootstrap >/dev/null
  stream_backup | docker compose --profile tools run --rm \
    -T \
    -e LEGACY_BACKUP_FILE=/tmp/legacy-backup.json \
    -e IMPORT_USER_EMAIL="${owner_email}" \
    "$@" \
    bootstrap sh -ceu '
      umask 077
      trap '\''rm -f "${LEGACY_BACKUP_FILE}"'\'' EXIT
      cat >"${LEGACY_BACKUP_FILE}"
      node dist/imports/legacy-backup.js
    '
}

echo "Validando copia histórica en modo simulación"
run_import

if [ "${apply_import}" != "1" ]; then
  echo "Simulación histórica terminada; staging no se ha modificado"
  exit 0
fi

echo "Aplicando copia histórica idempotente"
run_import -e LEGACY_IMPORT_APPLY=1

test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:14100/ready)" = "200"
test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' http://127.0.0.1:14173/healthz)" = "200"
echo "Importación histórica terminada y staging sano"
