do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'factupapa_migrator') then
    create role factupapa_migrator;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'factupapa_api') then
    create role factupapa_api;
  end if;
end
$roles$;

alter role factupapa_migrator
  nologin
  noinherit
  bypassrls;

alter role factupapa_api
  login
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit
  nobypassrls;

alter table companies owner to factupapa_migrator;
alter table users owner to factupapa_migrator;
alter table memberships owner to factupapa_migrator;
alter table contacts owner to factupapa_migrator;
alter table products owner to factupapa_migrator;
alter table invoices owner to factupapa_migrator;
alter table invoice_lines owner to factupapa_migrator;
alter table payments owner to factupapa_migrator;
alter table documents owner to factupapa_migrator;
alter table audit_events owner to factupapa_migrator;
alter table import_batches owner to factupapa_migrator;
alter table auth_sessions owner to factupapa_migrator;
alter table schema_migrations owner to factupapa_migrator;

alter type document_status owner to factupapa_migrator;
alter type invoice_status owner to factupapa_migrator;
alter type document_kind owner to factupapa_migrator;

revoke all on schema public from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;

grant usage, create on schema public to factupapa_migrator;
grant usage on schema public to factupapa_api;
grant select on companies to factupapa_api;
grant select on users to factupapa_api;
grant select on memberships to factupapa_api;
grant select, insert, update, delete on contacts to factupapa_api;
grant select, insert, update, delete on products to factupapa_api;
grant select, insert, update, delete on invoices to factupapa_api;
grant select, insert, update, delete on invoice_lines to factupapa_api;
grant select, insert, update, delete on payments to factupapa_api;
grant select, insert, update, delete on documents to factupapa_api;
grant select, insert, update, delete on import_batches to factupapa_api;
grant select, insert, update on auth_sessions to factupapa_api;
grant select, insert on audit_events to factupapa_api;
grant update (last_login_at, updated_at) on users to factupapa_api;

create function auth_lookup_user(p_email citext)
returns table (
  user_id uuid,
  company_id uuid,
  email text,
  display_name text,
  password_hash text,
  company_name text,
  membership_role text
)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
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
  where user_account.email = p_email
    and user_account.is_active = true
    and user_account.password_hash is not null
  order by membership.company_id
  limit 2
$$;

create function auth_resolve_refresh_tenant(p_refresh_token_hash text)
returns table (
  company_id uuid,
  user_id uuid
)
language sql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
  select
    session.company_id,
    session.user_id
  from public.auth_sessions as session
  where session.refresh_token_hash = p_refresh_token_hash
$$;

create function auth_record_anonymous_login_failure(p_entity_id text, p_reason text)
returns void
language sql
security definer
volatile
set search_path = pg_catalog, public, pg_temp
as $$
  insert into public.audit_events(company_id, actor_user_id, entity_type, entity_id, action, after_data)
  values (null, null, 'auth', p_entity_id, 'auth.login_failed', jsonb_build_object('reason', p_reason))
$$;

alter function auth_lookup_user(citext) owner to factupapa_migrator;
alter function auth_resolve_refresh_tenant(text) owner to factupapa_migrator;
alter function auth_record_anonymous_login_failure(text, text) owner to factupapa_migrator;

revoke all on function auth_lookup_user(citext) from public;
revoke all on function auth_resolve_refresh_tenant(text) from public;
revoke all on function auth_record_anonymous_login_failure(text, text) from public;
grant execute on function auth_lookup_user(citext) to factupapa_api;
grant execute on function auth_resolve_refresh_tenant(text) to factupapa_api;
grant execute on function auth_record_anonymous_login_failure(text, text) to factupapa_api;

alter table companies enable row level security;
alter table companies force row level security;
create policy companies_tenant_isolation on companies
  for all
  using (id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.current_company_id', true), '')::uuid);

alter table users enable row level security;
alter table users force row level security;
create policy users_identity_isolation on users
  for all
  using (id = nullif(current_setting('app.current_user_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.current_user_id', true), '')::uuid);

alter table memberships enable row level security;
alter table memberships force row level security;
create policy memberships_tenant_user_isolation on memberships
  for all
  using (
    company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  with check (
    company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

alter table auth_sessions enable row level security;
alter table auth_sessions force row level security;
create policy auth_sessions_tenant_user_isolation on auth_sessions
  for all
  using (
    company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  )
  with check (
    company_id = nullif(current_setting('app.current_company_id', true), '')::uuid
    and user_id = nullif(current_setting('app.current_user_id', true), '')::uuid
  );

alter table audit_events enable row level security;
alter table audit_events force row level security;
create policy audit_events_tenant_isolation on audit_events
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

do $policies$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'contacts',
    'products',
    'invoices',
    'invoice_lines',
    'payments',
    'documents',
    'import_batches'
  ]
  loop
    execute format('alter table public.%I enable row level security', protected_table);
    execute format('alter table public.%I force row level security', protected_table);
    execute format(
      'create policy %I on public.%I for all using (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid) with check (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid)',
      protected_table || '_tenant_isolation',
      protected_table
    );
  end loop;
end
$policies$;

alter default privileges for role factupapa_migrator in schema public
  revoke all on tables from public;
alter default privileges for role factupapa_migrator in schema public
  revoke all on sequences from public;
alter default privileges for role factupapa_migrator in schema public
  revoke execute on functions from public;
