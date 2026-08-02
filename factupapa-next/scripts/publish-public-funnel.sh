#!/usr/bin/env bash
set -Eeuo pipefail

readonly public_host="ubuntu-4gb-hel1-1.tail6dd682.ts.net"
readonly local_target="http://127.0.0.1:14173"

for command in curl grep tailscale; do
  command -v "${command}" >/dev/null || {
    echo "Falta el comando requerido: ${command}" >&2
    exit 1
  }
done

test "$(id -u)" = "1001" || {
  echo "La publicacion debe ejecutarse con el usuario rootless del runner" >&2
  exit 1
}

test "$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "${local_target}/healthz")" = "200" || {
  echo "FactuPapa Next no esta sano en ${local_target}" >&2
  exit 1
}
curl --silent --show-error "${local_target}/" | grep -q '<title>FactuPapa Next</title>' || {
  echo "El destino local no corresponde a FactuPapa Next" >&2
  exit 1
}

tailscale status --json >/dev/null
tailscale funnel --bg --yes "${local_target}"

funnel_status="$(tailscale funnel status --json)"
printf '%s' "${funnel_status}" | grep -Fq "${public_host}" || {
  echo "El estado de Funnel no contiene el host esperado" >&2
  exit 1
}
printf '%s' "${funnel_status}" | grep -Fq "${local_target}" || {
  echo "El estado de Funnel no contiene el destino esperado" >&2
  exit 1
}
unset funnel_status

echo "FactuPapa Next publicado de forma independiente en https://${public_host}"
