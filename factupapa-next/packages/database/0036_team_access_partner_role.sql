-- Socios (rol "partner") y registro restringido por lista de correos de Google.
--
-- Antes: cualquier cuenta de Google que entrase se registraba sola como "owner" de una
-- empresa nueva. Ahora: solo pueden entrar (a) las cuentas que ya existen (el usuario
-- maestro) y (b) los correos que el maestro dé de alta como socios. El resto se rechaza.
--
-- Migración aditiva. No toca datos existentes ni migraciones anteriores.

-- 1) Nuevo rol permitido en memberships.
do $roles$
declare
  existing_constraint text;
begin
  for existing_constraint in
    select constraint_row.conname
    from pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.memberships'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%role%'
  loop
    execute format('alter table public.memberships drop constraint %I', existing_constraint);
  end loop;
end
$roles$;

alter table public.memberships
  add constraint memberships_role_check
  check (role in ('owner', 'admin', 'member', 'viewer', 'partner'));

-- 2) Lista de socios autorizados. Solo se accede mediante las funciones de abajo.
create table public.team_access (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email citext not null,
  role text not null default 'partner' check (role = 'partner'),
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Un correo solo puede estar activo una vez (y en una única empresa).
create unique index team_access_active_email_idx
  on public.team_access (email)
  where revoked_at is null;
create index team_access_company_idx on public.team_access (company_id, created_at);

alter table public.team_access owner to factupapa_migrator;
alter table public.team_access enable row level security;
alter table public.team_access force row level security;
create policy team_access_tenant_isolation on public.team_access
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

-- Sin acceso directo para la API: solo vía funciones SECURITY DEFINER que verifican al maestro.
revoke all on public.team_access from public;
revoke all on public.team_access from factupapa_api;

-- 3) Gestión de socios (solo el usuario maestro, rol owner).
create function public.team_list_members(p_company_id uuid, p_actor_user_id uuid)
returns table (
  id uuid,
  email text,
  role text,
  created_at timestamptz,
  last_login_at timestamptz,
  registered boolean
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
    select t.id, t.email::text, t.role, t.created_at, u.last_login_at, (u.id is not null)
    from public.team_access as t
    left join public.users as u on lower(u.email::text) = lower(t.email::text)
    where t.company_id = p_company_id and t.revoked_at is null
    order by t.created_at, t.id;
end;
$function$;

create function public.team_add_partner(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_email text
)
returns table (id uuid, email text, role text, created_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  normalized_email text := lower(trim(p_email));
  active_partners integer;
  existing_user_id uuid;
  created_id uuid;
begin
  if not exists (
    select 1 from public.memberships as m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(normalized_email) > 320 then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('team_access:' || p_company_id::text, 1));

  select count(*) into active_partners
  from public.team_access as t
  where t.company_id = p_company_id and t.revoked_at is null;
  if active_partners >= 3 then
    raise exception 'team_limit_reached' using errcode = 'P0001';
  end if;

  select u.id into existing_user_id
  from public.users as u
  where lower(u.email::text) = normalized_email;

  -- El usuario maestro (u otro propietario/administrador de esta empresa) no puede convertirse en socio.
  if existing_user_id is not null and exists (
    select 1 from public.memberships as m
    where m.user_id = existing_user_id and m.company_id = p_company_id and m.role in ('owner', 'admin')
  ) then
    raise exception 'cannot_change_owner' using errcode = 'P0001';
  end if;

  begin
    insert into public.team_access (company_id, email, created_by_user_id)
    values (p_company_id, normalized_email, p_actor_user_id)
    returning team_access.id into created_id;
  exception when unique_violation then
    raise exception 'already_member' using errcode = 'P0001';
  end;

  if existing_user_id is not null then
    insert into public.memberships (company_id, user_id, role)
    values (p_company_id, existing_user_id, 'partner')
    on conflict on constraint memberships_pkey do nothing;
    update public.users set is_active = true, updated_at = now() where users.id = existing_user_id;
  end if;

  insert into public.audit_events (company_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (
    p_company_id, p_actor_user_id, 'team_access', created_id::text, 'team.partner_added',
    jsonb_build_object('email', normalized_email)
  );

  return query
    select t.id, t.email::text, t.role, t.created_at
    from public.team_access as t
    where t.id = created_id;
end;
$function$;

create function public.team_remove_partner(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_access_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  target_email text;
  target_user_id uuid;
begin
  if not exists (
    select 1 from public.memberships as m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id and m.role = 'owner'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select t.email::text into target_email
  from public.team_access as t
  where t.id = p_access_id and t.company_id = p_company_id and t.revoked_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.team_access set revoked_at = now() where id = p_access_id;

  select u.id into target_user_id
  from public.users as u
  where lower(u.email::text) = lower(target_email);

  if target_user_id is not null then
    update public.auth_sessions
      set revoked_at = now(), revocation_reason = 'access_revoked'
      where company_id = p_company_id and user_id = target_user_id and revoked_at is null;
    -- Se desactiva la cuenta salvo que sea propietaria de alguna empresa (no es el caso de un socio normal).
    update public.users
      set is_active = false, updated_at = now()
      where users.id = target_user_id
        and not exists (
          select 1 from public.memberships as m where m.user_id = target_user_id and m.role = 'owner'
        );
  end if;

  insert into public.audit_events (company_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (
    p_company_id, p_actor_user_id, 'team_access', p_access_id::text, 'team.partner_removed',
    jsonb_build_object('email', target_email)
  );
end;
$function$;

-- 4) Registro con Google restringido: solo cuentas existentes o socios autorizados.
create or replace function public.auth_find_or_register_google_user(
  requested_email text,
  requested_display_name text,
  generated_password_hash text
)
returns table (
  user_id uuid,
  company_id uuid,
  email text,
  display_name text,
  password_hash text,
  company_name text,
  membership_role text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  normalized_email text := lower(trim(requested_email));
  normalized_name text := trim(requested_display_name);
  invited_company_id uuid;
  partner_user_id uuid;
begin
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(normalized_email) > 320 then
    raise exception 'invalid_google_email';
  end if;
  if char_length(normalized_name) < 2 or char_length(normalized_name) > 120 then
    normalized_name := split_part(normalized_email, '@', 1);
  end if;
  if char_length(generated_password_hash) < 32 then
    raise exception 'invalid_generated_password_hash';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 1));

  -- (a) Socio autorizado por el usuario maestro: se une a SU empresa con rol partner.
  select t.company_id into invited_company_id
  from public.team_access as t
  where t.email = normalized_email::citext and t.revoked_at is null;

  if invited_company_id is not null then
    select u.id into partner_user_id
    from public.users as u
    where lower(u.email::text) = normalized_email;

    if partner_user_id is null then
      insert into public.users (email, display_name, password_hash)
      values (normalized_email, normalized_name, generated_password_hash)
      returning users.id into partner_user_id;
      insert into public.audit_events (company_id, actor_user_id, entity_type, entity_id, action, after_data)
      values (
        invited_company_id, partner_user_id, 'auth', partner_user_id::text,
        'auth.google_partner_registration_completed', jsonb_build_object('provider', 'google')
      );
    else
      update public.users set is_active = true where users.id = partner_user_id and is_active = false;
    end if;

    insert into public.memberships (company_id, user_id, role)
    values (invited_company_id, partner_user_id, 'partner')
    on conflict on constraint memberships_pkey do nothing;

    return query
      select u.id, m.company_id, u.email::text, u.display_name, u.password_hash, c.name, m.role
      from public.users as u
      join public.memberships as m on m.user_id = u.id and m.company_id = invited_company_id
      join public.companies as c on c.id = m.company_id
      where u.id = partner_user_id and m.role = 'partner';
    return;
  end if;

  -- (b) Cuenta ya existente y activa (p. ej. el usuario maestro). Un socio dado de baja
  --     NO puede entrar por aquí: sus membresías partner no cuentan sin autorización activa.
  return query
    select
      user_account.id,
      membership.company_id,
      user_account.email::text,
      user_account.display_name,
      user_account.password_hash,
      company.name,
      membership.role
    from public.users as user_account
    join public.memberships as membership on membership.user_id = user_account.id
    join public.companies as company on company.id = membership.company_id
    where lower(user_account.email::text) = normalized_email
      and user_account.is_active = true
      and membership.role <> 'partner'
    order by membership.company_id
    limit 1;
  if found then
    return;
  end if;

  -- (c) Cuenta nueva sin autorización: ya NO se crea una empresa nueva automáticamente.
  raise exception 'google_account_not_authorized' using errcode = 'P0001';
end;
$function$;

revoke all on function public.team_list_members(uuid, uuid) from public;
revoke all on function public.team_add_partner(uuid, uuid, text) from public;
revoke all on function public.team_remove_partner(uuid, uuid, uuid) from public;
grant execute on function public.team_list_members(uuid, uuid) to factupapa_api;
grant execute on function public.team_add_partner(uuid, uuid, text) to factupapa_api;
grant execute on function public.team_remove_partner(uuid, uuid, uuid) to factupapa_api;
revoke all on function public.auth_find_or_register_google_user(text, text, text) from public;
grant execute on function public.auth_find_or_register_google_user(text, text, text) to factupapa_api;
