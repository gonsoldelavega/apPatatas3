#!/bin/sh
set -eu

test "${API_DATABASE_USER}" = "factupapa_api"
test -n "${API_DATABASE_PASSWORD}"

psql "${DATABASE_ADMIN_URL:?Define DATABASE_ADMIN_URL}" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --set=api_password="${API_DATABASE_PASSWORD}" \
  <<'SQL'
select 'create role factupapa_api'
where not exists (
  select 1
  from pg_catalog.pg_roles
  where rolname = 'factupapa_api'
)
\gexec

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
