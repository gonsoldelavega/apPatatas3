alter table import_batches drop constraint import_batches_status_check;

update import_batches
set status = case status
  when 'planned' then 'pending'
  when 'running' then 'importing'
  when 'rolled_back' then 'failed'
  else status
end;

alter table import_batches rename column source_snapshot_sha256 to checksum;
alter table import_batches rename column summary to validation_summary;
alter table import_batches alter column source drop not null;
alter table import_batches alter column mode drop not null;
alter table import_batches alter column mode drop default;

alter table import_batches
  add column created_by_user_id uuid,
  add column entity_type text,
  add column source_format text,
  add column total_rows integer not null default 0,
  add column valid_rows integer not null default 0,
  add column invalid_rows integer not null default 0,
  add column duplicate_rows integer not null default 0,
  add column validated_at timestamptz,
  add column failed_at timestamptz;

update import_batches
set checksum = coalesce(checksum, encode(digest(id::text, 'sha256'), 'hex')),
    entity_type = 'contacts',
    source_format = 'json';

alter table import_batches
  alter column checksum set not null,
  alter column entity_type set not null,
  alter column source_format set not null,
  add constraint import_batches_creator_fk
    foreign key (company_id, created_by_user_id)
    references memberships(company_id, user_id),
  add constraint import_batches_entity_type_check
    check (entity_type in ('contacts', 'products', 'contact_product_prices')),
  add constraint import_batches_source_format_check
    check (source_format in ('csv', 'json')),
  add constraint import_batches_status_check
    check (status in ('pending', 'validated', 'importing', 'completed', 'failed', 'cancelled')),
  add constraint import_batches_counts_check
    check (
      total_rows >= 0 and valid_rows >= 0 and invalid_rows >= 0 and duplicate_rows >= 0
      and valid_rows + invalid_rows = total_rows
      and duplicate_rows <= invalid_rows
    ),
  add constraint import_batches_checksum_check
    check (checksum ~ '^[0-9a-f]{64}$'),
  add constraint import_batches_validation_summary_object_check
    check (jsonb_typeof(validation_summary) = 'object');

create index import_batches_company_created_idx
  on import_batches(company_id, created_at desc, id desc);
alter table import_batches
  add constraint import_batches_company_id_id_key unique (company_id, id);
create index import_batches_company_checksum_idx
  on import_batches(company_id, entity_type, checksum, created_at desc);

create table import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  batch_id uuid not null,
  row_number integer not null check (row_number > 0),
  classification text not null check (classification in ('new', 'possible_update', 'duplicate', 'conflict', 'error')),
  proposed_action text not null check (proposed_action in ('create', 'update', 'skip', 'reject')),
  normalized_data jsonb not null,
  errors jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint import_batch_rows_company_fk
    foreign key (company_id) references companies(id) on delete cascade,
  constraint import_batch_rows_company_batch_fk
    foreign key (company_id, batch_id) references import_batches(company_id, id) on delete cascade,
  constraint import_batch_rows_company_batch_unique
    unique (company_id, batch_id, row_number),
  constraint import_batch_rows_normalized_object_check
    check (jsonb_typeof(normalized_data) = 'object'),
  constraint import_batch_rows_errors_array_check
    check (jsonb_typeof(errors) = 'array'),
  constraint import_batch_rows_warnings_array_check
    check (jsonb_typeof(warnings) = 'array')
);

create index import_batch_rows_batch_order_idx
  on import_batch_rows(company_id, batch_id, row_number);

alter table import_batch_rows owner to factupapa_migrator;
grant select, insert, update, delete on import_batch_rows to factupapa_api;

alter table import_batch_rows enable row level security;
alter table import_batch_rows force row level security;
create policy import_batch_rows_tenant_isolation on import_batch_rows
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
