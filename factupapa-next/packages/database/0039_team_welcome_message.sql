-- Mensaje de bienvenida por socio (p. ej. «¡Bienvenida, Irene!»).
--
-- Lo escribe el usuario maestro al dar de alta al socio y se muestra en el inicio de ese socio.
-- Migración aditiva: columna nueva + funciones nuevas. Solo se recrea team_list_members para
-- devolver también el mensaje.

alter table public.team_access
  add column welcome_message text
  check (welcome_message is null or char_length(welcome_message) between 1 and 80);

drop function public.team_list_members(uuid, uuid);

create function public.team_list_members(p_company_id uuid, p_actor_user_id uuid)
returns table (
  id uuid,
  email text,
  role text,
  created_at timestamptz,
  last_login_at timestamptz,
  registered boolean,
  welcome_message text
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if not exists (
    select 1 from public.memberships as m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select t.id, t.email::text, t.role, t.created_at, u.last_login_at, (u.id is not null), t.welcome_message
    from public.team_access as t
    left join public.users as u on lower(u.email::text) = lower(t.email::text)
    where t.company_id = p_company_id and t.revoked_at is null
    order by t.created_at, t.id;
end;
$function$;

-- El maestro fija o cambia el mensaje de un socio activo (vacío = sin mensaje propio).
create function public.team_set_welcome(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_access_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  cleaned text := nullif(trim(coalesce(p_message, '')), '');
begin
  if not exists (
    select 1 from public.memberships as m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if cleaned is not null and char_length(cleaned) > 80 then
    raise exception 'invalid_welcome' using errcode = '22023';
  end if;
  update public.team_access
    set welcome_message = cleaned
    where id = p_access_id and company_id = p_company_id and revoked_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$function$;

-- Lo lee el propio socio (identificado por su sesión) para su pantalla de inicio.
create function public.team_my_welcome(p_user_id uuid)
returns text
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $function$
  select t.welcome_message
  from public.team_access as t
  join public.users as u on lower(u.email::text) = lower(t.email::text)
  where u.id = p_user_id and t.revoked_at is null
  limit 1;
$function$;

revoke all on function public.team_list_members(uuid, uuid) from public;
revoke all on function public.team_set_welcome(uuid, uuid, uuid, text) from public;
revoke all on function public.team_my_welcome(uuid) from public;
grant execute on function public.team_list_members(uuid, uuid) to factupapa_api;
grant execute on function public.team_set_welcome(uuid, uuid, uuid, text) to factupapa_api;
grant execute on function public.team_my_welcome(uuid) to factupapa_api;
