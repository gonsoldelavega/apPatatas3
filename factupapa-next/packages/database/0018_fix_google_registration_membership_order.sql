-- Repair Google registration for existing users without relying on a
-- non-existent memberships.created_at column. This remains a narrow
-- security-definer entrypoint for the application role.

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
as $$
declare
  normalized_email text := lower(trim(requested_email));
  normalized_name text := trim(requested_display_name);
  created_user_id uuid;
  created_company_id uuid;
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
    order by membership.company_id
    limit 1;
  if found then
    return;
  end if;

  insert into public.companies(name)
  values (left(normalized_name || ' · FactuPapa', 120))
  returning id into created_company_id;

  insert into public.users(email, display_name, password_hash)
  values (normalized_email, normalized_name, generated_password_hash)
  returning id into created_user_id;

  insert into public.memberships(company_id, user_id, role)
  values (created_company_id, created_user_id, 'owner');

  insert into public.audit_events(
    company_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    after_data
  ) values (
    created_company_id,
    created_user_id,
    'auth',
    created_user_id::text,
    'auth.google_registration_completed',
    jsonb_build_object('provider', 'google')
  );

  return query
    select
      created_user_id,
      created_company_id,
      normalized_email,
      normalized_name,
      generated_password_hash,
      left(normalized_name || ' · FactuPapa', 120),
      'owner'::text;
end;
$$;

revoke all on function public.auth_find_or_register_google_user(text, text, text) from public;
grant execute on function public.auth_find_or_register_google_user(text, text, text) to factupapa_api;
