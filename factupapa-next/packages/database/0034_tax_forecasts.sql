begin;
create table tax_profiles (
  company_id uuid primary key references companies(id) on delete cascade,
  income_tax_regime text not null default 'direct' check (income_tax_regime in ('direct','objective','not_applicable')),
  irpf_rate numeric(5,2) not null default 20 check (irpf_rate between 0 and 100),
  annual_minoration numeric(16,4) not null default 0 check (annual_minoration >= 0),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid not null
);
create table tax_settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tax_model text not null check (tax_model in ('303','130')),
  year integer not null check (year between 2000 and 2200),
  quarter integer not null check (quarter between 1 and 4),
  estimated_amount numeric(16,4) not null default 0,
  filed_amount numeric(16,4),
  filed_at timestamptz,
  status text not null default 'estimated' check (status in ('estimated','filed','not_applicable')),
  notes text,
  created_by_user_id uuid not null,
  updated_at timestamptz not null default now(),
  unique(company_id,tax_model,year,quarter)
);
create index tax_settlements_company_period_idx on tax_settlements(company_id,year,quarter);
create trigger tax_profiles_set_updated_at before update on tax_profiles for each row execute function set_updated_at();
create trigger tax_settlements_set_updated_at before update on tax_settlements for each row execute function set_updated_at();
alter table tax_profiles owner to factupapa_migrator;
alter table tax_settlements owner to factupapa_migrator;
grant select, insert, update on tax_profiles to factupapa_api;
grant select, insert, update on tax_settlements to factupapa_api;
alter table tax_profiles enable row level security;
alter table tax_profiles force row level security;
create policy tax_profiles_tenant_isolation on tax_profiles for all using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid) with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
alter table tax_settlements enable row level security;
alter table tax_settlements force row level security;
create policy tax_settlements_tenant_isolation on tax_settlements for all using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid) with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
commit;
