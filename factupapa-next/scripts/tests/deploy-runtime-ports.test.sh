#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091
source "${root}/deploy-runtime-ports.sh"

for ports in '4100 4173' '24105 24106'; do
  read -r APP_PORT WEB_PORT <<<"${ports}"
  export APP_PORT WEB_PORT
  validate_runtime_ports
  test "$(api_local_url health)" = "http://127.0.0.1:${APP_PORT}/health"
  test "$(api_local_url ready)" = "http://127.0.0.1:${APP_PORT}/ready"
  test "$(web_local_url healthz)" = "http://127.0.0.1:${WEB_PORT}/healthz"
done

APP_PORT=14100 WEB_PORT=0
if validate_runtime_ports 2>/dev/null; then
  echo 'Se aceptó un puerto inválido' >&2
  exit 1
fi
echo 'deploy runtime ports: PASS'
