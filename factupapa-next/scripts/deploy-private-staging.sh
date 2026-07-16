#!/usr/bin/env bash
set -Eeuo pipefail

staging_root="${HOME}/staging"
repository="${staging_root}/repo"
infrastructure="${repository}/factupapa-next/infrastructure"
environment_file="${infrastructure}/.env"
override_file="${staging_root}/docker-compose.staging.yml"
backup_directory="${staging_root}/backups"
expected_sha="${GITHUB_SHA:?GITHUB_SHA is required}"
branch="design/factupapa-full-prototype"

for command in docker git curl npm flock; do command -v "${command}" >/dev/null; done

exec 9>"${RUNNER_TEMP:-/tmp}/factupapa-staging-deploy.lock"
flock -n 9 || { echo "Otro despliegue de staging está en curso" >&2; exit 1; }

test "$(id -u)" = "1001"
test "${DOCKER_HOST:-}" = "unix:///run/user/1001/docker.sock"
docker info --format '{{json .SecurityOptions}}' | grep -q 'name=rootless'
test -d "${repository}/.git"
test -f "${environment_file}"
test -f "${override_file}"
test "$(stat -c '%a' "${environment_file}")" = "600"
test -z "$(git -C "${repository}" status --short)"

export COMPOSE_PROJECT_NAME=factupapa_staging
export COMPOSE_FILE="${infrastructure}/docker-compose.yml:${override_file}"
set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a

old_sha="$(git -C "${repository}" rev-parse HEAD)"
echo "Creando copia verificada previa al despliegue"
(
  cd "${repository}/factupapa-next/apps/api"
  npm ci --no-audit --no-fund >/dev/null
  BACKUP_ENVIRONMENT=staging BACKUP_DIRECTORY="${backup_directory}" \
    BACKUP_MAX_COPIES=14 BACKUP_MAX_AGE_DAYS=30 npm run --silent backup:database >/dev/null
)

git -C "${repository}" fetch --no-tags origin "${branch}"
test "$(git -C "${repository}" rev-parse FETCH_HEAD)" = "${expected_sha}"
git -C "${repository}" merge-base --is-ancestor "${old_sha}" "${expected_sha}"
git -C "${repository}" switch "${branch}"
git -C "${repository}" merge --ff-only "${expected_sha}"
test "$(git -C "${repository}" rev-parse HEAD)" = "${expected_sha}"
test -z "$(git -C "${repository}" status --short)"

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
