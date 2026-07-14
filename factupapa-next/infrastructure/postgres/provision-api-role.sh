#!/bin/sh
set -eu

test "${API_DATABASE_USER}" = "factupapa_api"
test -n "${API_DATABASE_PASSWORD}"

psql \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --set=api_password="${API_DATABASE_PASSWORD}" \
  <<'SQL'
alter role factupapa_api
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  nobypassrls
  password :'api_password';
SQL

echo "Rol de ejecución de la API preparado"
