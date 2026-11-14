-- Importación automática del Registro Maestro de compras: el servidor necesita saber, sin sesión de usuario,
-- a qué empresas debe importar y con qué usuario propietario se registra cada importación.
-- users/memberships solo dejan ver la propia fila (RLS), por eso va en una función SECURITY DEFINER de solo lectura.
-- Migración aditiva: solo crea una función.

create function public.registry_sync_targets()
returns table (company_id uuid, user_id uuid, email text, display_name text, company_name text)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $function$
  select m.company_id, u.id, u.email::text, u.display_name, c.name
  from public.memberships as m
  join public.users as u on u.id = m.user_id and u.is_active
  join public.companies as c on c.id = m.company_id
  where m.role = 'owner'
  order by m.company_id, u.created_at
$function$;

revoke all on function public.registry_sync_targets() from public;
grant execute on function public.registry_sync_targets() to factupapa_api;
