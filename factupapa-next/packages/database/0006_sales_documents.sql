create type delivery_note_status as enum ('draft', 'issued', 'invoiced', 'cancelled');
create type sales_document_source as enum ('manual', 'delivery_notes');

alter table companies
  add column address jsonb not null default '{}'::jsonb,
  add constraint companies_address_object_check check (jsonb_typeof(address) = 'object');

create table document_sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  document_type text not null check (document_type in ('delivery_note', 'invoice')),
  series text not null check (char_length(series) between 1 and 20),
  next_number integer not null default 1 check (next_number > 0),
  unique (company_id, document_type, series)
);

create table delivery_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid not null,
  number integer,
  series text not null default 'A' check (char_length(series) between 1 and 20),
  issue_date date not null,
  status delivery_note_status not null default 'draft',
  notes text check (notes is null or char_length(notes) <= 4000),
  subtotal numeric(16,4) not null default 0 check (subtotal >= 0),
  tax_total numeric(16,4) not null default 0 check (tax_total >= 0),
  total numeric(16,4) not null default 0 check (total >= 0),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  cancelled_at timestamptz,
  unique (company_id, id),
  unique (company_id, series, number),
  foreign key (company_id, contact_id) references contacts(company_id, id),
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id),
  check ((status = 'draft' and number is null and issued_at is null) or (status <> 'draft' and number is not null and issued_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create table delivery_note_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  delivery_note_id uuid not null,
  product_id uuid,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  quantity numeric(16,4) not null check (quantity > 0),
  unit text not null check (unit in ('kg', 'g', 'unit', 'box', 'custom')),
  unit_price numeric(16,4) not null check (unit_price >= 0),
  tax_rate numeric(6,3) not null check (tax_rate between 0 and 100),
  line_subtotal numeric(16,4) not null check (line_subtotal >= 0),
  line_tax numeric(16,4) not null check (line_tax >= 0),
  line_total numeric(16,4) not null check (line_total >= 0),
  position integer not null check (position > 0),
  unique (company_id, delivery_note_id, position),
  foreign key (company_id, delivery_note_id) references delivery_notes(company_id, id) on delete cascade,
  foreign key (company_id, product_id) references products(company_id, id)
);

alter table invoices
  alter column number drop not null,
  alter column subtotal type numeric(16,4),
  alter column tax_total type numeric(16,4),
  alter column total type numeric(16,4),
  add column source_type sales_document_source not null default 'manual',
  add column created_by_user_id uuid,
  add column issued_at timestamptz,
  add column cancelled_at timestamptz,
  add column contact_legal_name text,
  add column contact_tax_id text,
  add column contact_address jsonb,
  add column issuer_legal_name text,
  add column issuer_tax_id text,
  add column issuer_address jsonb;

update invoices set contact_legal_name = contact.legal_name,
  contact_tax_id = contact.tax_id, contact_address = contact.address
from contacts as contact where contact.id = invoices.contact_id;

update invoices set issuer_legal_name = company.name,
  issuer_tax_id = company.tax_id, issuer_address = company.address
from companies as company where company.id = invoices.company_id;

alter table invoices
  alter column contact_legal_name set not null,
  alter column contact_address set not null,
  alter column issuer_legal_name set not null,
  alter column issuer_address set not null,
  add constraint invoices_contact_snapshot_address_check check (jsonb_typeof(contact_address) = 'object'),
  add constraint invoices_issuer_snapshot_address_check check (jsonb_typeof(issuer_address) = 'object'),
  add constraint invoices_creator_fk foreign key (company_id, created_by_user_id) references memberships(company_id, user_id),
  add constraint invoices_sales_direction_check check (direction = 'sale'),
  add constraint invoices_sales_status_check check (status in ('draft', 'issued', 'cancelled'));

alter table invoice_lines
  alter column quantity type numeric(16,4),
  alter column unit_price type numeric(16,4),
  alter column line_total type numeric(16,4),
  add column unit text not null default 'unit',
  add column line_subtotal numeric(16,4),
  add column line_tax numeric(16,4);
update invoice_lines set line_subtotal = line_total, line_tax = 0;
alter table invoice_lines
  alter column line_subtotal set not null,
  alter column line_tax set not null,
  add constraint invoice_lines_unit_check check (unit in ('kg', 'g', 'unit', 'box', 'custom')),
  add constraint invoice_lines_quantity_positive_check check (quantity > 0),
  add constraint invoice_lines_amounts_nonnegative_check check (unit_price >= 0 and line_subtotal >= 0 and line_tax >= 0 and line_total >= 0),
  add constraint invoice_lines_company_invoice_position_key unique (company_id, invoice_id, position);

create table invoice_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null,
  delivery_note_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, delivery_note_id),
  foreign key (company_id, invoice_id) references invoices(company_id, id) on delete cascade,
  foreign key (company_id, delivery_note_id) references delivery_notes(company_id, id)
);

create index delivery_notes_list_idx on delivery_notes(company_id, status, issue_date desc, id desc);
create index delivery_notes_contact_idx on delivery_notes(company_id, contact_id, issue_date desc);
create index delivery_note_lines_document_idx on delivery_note_lines(company_id, delivery_note_id, position);
create index invoices_sales_list_idx on invoices(company_id, status, issue_date desc, id desc);
create index invoice_delivery_notes_invoice_idx on invoice_delivery_notes(company_id, invoice_id);

create trigger delivery_notes_set_updated_at before update on delivery_notes
for each row execute function set_updated_at();

alter type delivery_note_status owner to factupapa_migrator;
alter type sales_document_source owner to factupapa_migrator;
alter table document_sequences owner to factupapa_migrator;
alter table delivery_notes owner to factupapa_migrator;
alter table delivery_note_lines owner to factupapa_migrator;
alter table invoice_delivery_notes owner to factupapa_migrator;

grant select, insert, update on document_sequences to factupapa_api;
grant select, insert, update on delivery_notes to factupapa_api;
grant select, insert, update, delete on delivery_note_lines to factupapa_api;
grant select, insert, update, delete on invoice_delivery_notes to factupapa_api;

do $rls$
declare protected_table text;
begin
  foreach protected_table in array array['document_sequences','delivery_notes','delivery_note_lines','invoice_delivery_notes'] loop
    execute format('alter table public.%I enable row level security', protected_table);
    execute format('alter table public.%I force row level security', protected_table);
    execute format(
      'create policy %I on public.%I for all using (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid) with check (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid)',
      protected_table || '_tenant_isolation', protected_table
    );
  end loop;
end $rls$;
