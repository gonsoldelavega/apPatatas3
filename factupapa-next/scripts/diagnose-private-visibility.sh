#!/usr/bin/env bash
set -Eeuo pipefail

repository="${1:-${GITHUB_WORKSPACE:-}}"
owner_email="${IMPORT_USER_EMAIL:-}"
environment_file="${HOME}/staging/repo/factupapa-next/infrastructure/.env"
override_file="${HOME}/staging/docker-compose.staging.yml"

[ -n "${repository}" ] || { echo "Indica la ruta del repositorio" >&2; exit 1; }
[ -n "${owner_email}" ] || { echo "Define IMPORT_USER_EMAIL" >&2; exit 1; }
[ -f "${environment_file}" ] || { echo "Falta el entorno privado de staging" >&2; exit 1; }
[ -f "${override_file}" ] || { echo "Falta la configuracion privada de staging" >&2; exit 1; }

export COMPOSE_PROJECT_NAME=factupapa_staging
export COMPOSE_FILE="${repository}/factupapa-next/infrastructure/docker-compose.yml:${override_file}"
set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a

cd "${repository}/factupapa-next/infrastructure"
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  psql --no-psqlrc -v ON_ERROR_STOP=1 -v email="${owner_email}" \
  -At -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<'SQL'
with target_user as (
  select id from users where lower(email::text)=lower(:'email')
), ranked_memberships as (
  select membership.company_id,
         membership.role,
         row_number() over(order by membership.company_id) as auth_position
    from memberships as membership
    join target_user on target_user.id=membership.user_id
), company_counts as (
  select membership.auth_position,
         membership.role,
         (select count(*) from contacts where company_id=membership.company_id) as contacts,
         (select count(*) from products where company_id=membership.company_id) as products,
         (select count(*) from invoices where company_id=membership.company_id) as invoices,
         (select count(*) from invoices where company_id=membership.company_id and source='legacy_backup') as legacy_invoices,
         (select count(*) from purchase_invoices where company_id=membership.company_id) as purchases,
         (select count(*) from purchase_invoices where company_id=membership.company_id and source_registry_key like 'legacy-purchase:%') as legacy_purchases,
         (select count(*) from recurring_expenses where company_id=membership.company_id) as recurring_expenses
    from ranked_memberships as membership
)
select json_build_object(
  'targetUsers', (select count(*) from target_user),
  'memberships', (select count(*) from ranked_memberships),
  'authSelectedRole', (select role from company_counts where auth_position=1),
  'authSelectedHasLegacyData', coalesce((select legacy_invoices=49 and legacy_purchases=73 from company_counts where auth_position=1), false),
  'ownerSelectedMatchesAuth', coalesce(
    (select auth_position=1 from company_counts where role='owner' order by auth_position limit 1),
    false
  ),
  'companies', coalesce((
    select json_agg(json_build_object(
      'position', auth_position,
      'role', role,
      'contacts', contacts,
      'products', products,
      'invoices', invoices,
      'legacyInvoices', legacy_invoices,
      'purchases', purchases,
      'legacyPurchases', legacy_purchases,
      'recurringExpenses', recurring_expenses
    ) order by auth_position)
    from company_counts
  ), '[]'::json)
);
SQL
