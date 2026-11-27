#!/usr/bin/env bash
# Diagnostico (solo lectura) de la importacion automatica del Registro Maestro en staging:
# configuracion del contenedor, alcance de la hoja desde dentro del servidor, compras importadas
# y registros recientes del servidor. No modifica nada ni imprime secretos.
set -Eeuo pipefail

repository="${1:-${GITHUB_WORKSPACE:-}}"
environment_file="${HOME}/staging/repo/factupapa-next/infrastructure/.env"
override_file="${HOME}/staging/docker-compose.staging.yml"
[ -n "${repository}" ] || { echo "Indica la ruta del repositorio" >&2; exit 1; }
[ -f "${environment_file}" ] || { echo "Falta el entorno privado de staging" >&2; exit 1; }

export COMPOSE_PROJECT_NAME=factupapa_staging
export COMPOSE_FILE="${repository}/factupapa-next/infrastructure/docker-compose.yml:${override_file}"
set -a
# shellcheck disable=SC1090
source "${environment_file}"
set +a
cd "${repository}/factupapa-next/infrastructure"

echo "== 1. Configuracion de la importacion en el contenedor api =="
docker compose exec -T api node -e '
const url = process.env.PURCHASE_REGISTRY_WEBAPP_URL || "";
let host = "";
try { host = new URL(url).host + new URL(url).pathname.replace(/[A-Za-z0-9_-]{20,}/g, "<id>"); } catch {}
console.log(JSON.stringify({ urlConfigured: Boolean(url), shape: host, ownTaxIds: Boolean(process.env.OWN_TAX_IDS), driveRoot: process.env.DRIVE_LIBRARY_FOLDER_ID ? "set" : "default" }));
'

echo "== 2. La hoja, vista desde dentro del servidor =="
docker compose exec -T api node -e '
(async () => {
  const url = process.env.PURCHASE_REGISTRY_WEBAPP_URL;
  if (!url) { console.log("sin URL"); return; }
  const started = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", headers: { Accept: "application/json,text/csv" } });
    const body = await r.text();
    const lines = body.split(/\r?\n/).filter(Boolean);
    const compras = lines.filter((l) => /,compra,/i.test(l)).length;
    console.log(JSON.stringify({ status: r.status, type: r.headers.get("content-type"), bytes: body.length, filas: lines.length, comprasEnCsv: compras, ms: Date.now() - started, empiezaPor: body.slice(0, 40).replace(/[^A-Za-z0-9,\-\/ ]/g, "?") }));
  } catch (e) { console.log(JSON.stringify({ error: String(e && e.message || e), causa: String(e && e.cause && (e.cause.code || e.cause.message) || "") })); }
})();
'

echo "== 3. Compras importadas del Registro (fecha de factura >= 2026-10-25) =="
docker compose exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  psql --no-psqlrc -At -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" <<'SQL'
select 'compras_total=' || count(*) || ' | con_clave_registro=' || count(*) filter (where source_registry_key is not null and source_registry_key not like 'legacy-purchase:%')
  from purchase_invoices where deleted_at is null;
select to_char(issue_date,'YYYY-MM-DD') || ' | ' || coalesce(supplier_legal_name,'?') || ' | ' || coalesce(supplier_invoice_number,'(sin numero)') || ' | ' || total || ' | ' || status || ' | ' || case when source_registry_key is null then 'a mano' else 'registro' end
  from purchase_invoices where deleted_at is null and issue_date >= '2026-10-25' order by issue_date, created_at;
select 'ultimas_importaciones_registro: ' || coalesce(string_agg(to_char(created_at,'MM-DD HH24:MI') || ' ' || action, ' ; ' order by created_at desc), 'ninguna')
  from (select created_at, action from audit_events where action like 'purchase_invoice.registry_%' order by created_at desc limit 8) t;
SQL

echo "== 4. Registros recientes del servidor sobre el registro =="
docker compose logs --no-color --tail 4000 api 2>/dev/null | grep -Ei 'registry|registro' | tail -n 25 | cut -c1-300 || true
echo "== fin =="
# Verificado tras el arreglo de compose (27/11/2026).
# Verificado tras el arreglo de comillas (27/11/2026).
