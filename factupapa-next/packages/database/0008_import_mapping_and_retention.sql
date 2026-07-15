create table import_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  entity_type text not null check (entity_type in ('contacts', 'products', 'contact_product_prices')),
  source_format text not null check (source_format in ('csv', 'json')),
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object'),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint import_mappings_creator_fk
    foreign key (company_id, created_by_user_id)
    references memberships(company_id, user_id)
);

create unique index import_mappings_active_name_key
  on import_mappings(company_id, entity_type, lower(btrim(name)))
  where deleted_at is null;

create index import_mappings_company_type_idx
  on import_mappings(company_id, entity_type, created_at desc, id desc)
  where deleted_at is null;

create trigger import_mappings_set_updated_at
before update on import_mappings
for each row execute function set_updated_at();

alter table import_batches
  add column mapping_used jsonb not null default '{}'::jsonb
    check (jsonb_typeof(mapping_used) = 'object');

alter table import_mappings owner to factupapa_migrator;
grant select, insert, update on import_mappings to factupapa_api;
grant select on schema_migrations to factupapa_api;

alter table import_mappings enable row level security;
alter table import_mappings force row level security;
create policy import_mappings_tenant_isolation on import_mappings
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
