create table public.company_sales_preferences (
  company_id uuid primary key references public.companies(id) on delete cascade,
  invoice_prefix text not null default 'FAC' check (invoice_prefix ~ '^[A-Z0-9_-]{1,12}$'),
  invoice_start_number integer not null default 100 check (invoice_start_number between 1 and 999999999),
  default_tax_rate numeric(6,3) not null default 4 check (default_tax_rate between 0 and 100),
  primary_sales_flow text not null default 'invoices' check (primary_sales_flow in ('adaptive','invoices','delivery_notes')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.company_sales_preferences(company_id)
select id from public.companies
on conflict(company_id) do nothing;

create trigger company_sales_preferences_set_updated_at
before update on public.company_sales_preferences
for each row execute function public.set_updated_at();

alter table public.company_sales_preferences owner to factupapa_migrator;
grant select, insert, update on public.company_sales_preferences to factupapa_api;
alter table public.company_sales_preferences enable row level security;
alter table public.company_sales_preferences force row level security;
create policy company_sales_preferences_tenant_isolation on public.company_sales_preferences
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
