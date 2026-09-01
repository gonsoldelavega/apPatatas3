#!/bin/sh
set -eu

test -n "${API_DATABASE_USER}"
test -n "${API_DATABASE_PASSWORD}"

admin_user="$(
  psql "${DATABASE_ADMIN_URL:?Define DATABASE_ADMIN_URL}" \
    --no-psqlrc \
    --tuples-only \
    --no-align \
    --set=ON_ERROR_STOP=1 \
    --command='select current_user'
)"

if [ "${admin_user}" = "${API_DATABASE_USER}" ]; then
  echo "El rol de la API coincide con el administrador existente; se conserva sin modificar"
  exit 0
fi

psql "${DATABASE_ADMIN_URL}" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --set=api_user="${API_DATABASE_USER}" \
  --set=api_password="${API_DATABASE_PASSWORD}" \
  <<'SQL'
select format('create role %I', :'api_user')
where not exists (
  select 1
  from pg_catalog.pg_roles
  where rolname = :'api_user'
)
\gexec

alter role :"api_user"
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  nobypassrls
  password :'api_password';
SQL

echo "Rol de ejecución de la API preparado"
