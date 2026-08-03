create table if not exists public.gmail_integrations (
  company_id uuid primary key references public.companies(id) on delete cascade,
  connected_by_user_id uuid not null references public.users(id),
  google_email text not null,
  encrypted_refresh_token text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.gmail_integrations to factupapa_api;

alter table public.gmail_integrations enable row level security;
alter table public.gmail_integrations force row level security;
create policy gmail_integrations_tenant_isolation on public.gmail_integrations
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
