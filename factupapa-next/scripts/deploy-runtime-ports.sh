#!/usr/bin/env bash

validate_runtime_ports() {
  local name value
  for name in APP_PORT WEB_PORT; do
    value="${!name:-}"
    case "${value}" in
      ''|*[!0-9]*) echo "${name} debe ser un puerto numérico" >&2; return 1 ;;
    esac
    if [ "${value}" -lt 1 ] || [ "${value}" -gt 65535 ]; then
      echo "${name} fuera de rango: ${value}" >&2
      return 1
    fi
  done
}

api_local_url() { printf 'http://127.0.0.1:%s/%s' "${APP_PORT}" "$1"; }
web_local_url() { printf 'http://127.0.0.1:%s/%s' "${WEB_PORT}" "$1"; }
