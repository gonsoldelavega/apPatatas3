-- Complete the private-beta operational model without introducing fiscal
-- chaining or VERI*FACTU. All changes are additive and tenant isolated.

alter table public.products
  add column package_kind text not null default 'none',
  add column package_label text,
  add column units_per_package numeric(16,4),
  add column package_cost numeric(16,4),
  add column expected_loss_rate numeric(6,3) not null default 0,
  add constraint products_package_kind_check
    check (package_kind in ('none','bag','box','sack','tray','custom')),
  add constraint products_package_label_check
    check (package_label is null or char_length(package_label) <= 80),
  add constraint products_units_per_package_check
    check (units_per_package is null or units_per_package > 0),
  add constraint products_package_cost_check
    check (package_cost is null or package_cost >= 0),
  add constraint products_expected_loss_rate_check
    check (expected_loss_rate between 0 and 100),
  add constraint products_package_consistency_check
    check (
      (package_kind = 'none' and units_per_package is null)
      or (package_kind <> 'none' and units_per_package is not null)
    );

alter table public.invoice_lines
  add column package_kind text,
  add column package_label text,
  add column package_quantity numeric(16,4),
  add column units_per_package numeric(16,4),
  add constraint invoice_lines_package_kind_check
    check (package_kind is null or package_kind in ('bag','box','sack','tray','custom')),
  add constraint invoice_lines_package_quantity_check
    check (package_quantity is null or package_quantity > 0),
  add constraint invoice_lines_units_per_package_check
    check (units_per_package is null or units_per_package > 0),
  add constraint invoice_lines_package_snapshot_check
    check (
      (package_kind is null and package_quantity is null and units_per_package is null)
      or (package_kind is not null and package_quantity is not null and units_per_package is not null)
    );

alter table public.purchase_invoices
  add column source_registry_key text,
  add column source_registry_url text,
  add column source_registry_filename text,
  add constraint purchase_invoices_source_registry_key_length_check
    check (source_registry_key is null or char_length(source_registry_key) between 1 and 200),
  add constraint purchase_invoices_source_registry_url_length_check
    check (source_registry_url is null or char_length(source_registry_url) <= 2000),
  add constraint purchase_invoices_source_registry_filename_length_check
    check (source_registry_filename is null or char_length(source_registry_filename) <= 500);

create unique index purchase_invoices_registry_unique_idx
  on public.purchase_invoices(company_id, source_registry_key)
  where source_registry_key is not null;

alter table public.payments
  add column purchase_invoice_id uuid,
  add column notes text,
  add column created_by_user_id uuid,
  add constraint payments_company_purchase_fk
    foreign key (company_id, purchase_invoice_id)
    references public.purchase_invoices(company_id, id),
  add constraint payments_company_creator_fk
    foreign key (company_id, created_by_user_id)
    references public.memberships(company_id, user_id),
  add constraint payments_single_document_check
    check (num_nonnulls(invoice_id, purchase_invoice_id) = 1),
  add constraint payments_direction_document_check
    check (
      (direction = 'incoming' and invoice_id is not null)
      or (direction = 'outgoing' and purchase_invoice_id is not null)
    ),
  add constraint payments_notes_check
    check (notes is null or char_length(notes) <= 1000);

create index payments_invoice_paid_at_idx
  on public.payments(company_id, invoice_id, paid_at desc)
  where invoice_id is not null;
create index payments_purchase_paid_at_idx
  on public.payments(company_id, purchase_invoice_id, paid_at desc)
  where purchase_invoice_id is not null;

create table public.production_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  input_product_id uuid not null,
  output_product_id uuid not null,
  occurred_on date not null,
  input_quantity numeric(16,4) not null check (input_quantity > 0),
  output_quantity numeric(16,4) not null check (output_quantity > 0),
  package_quantity numeric(16,4) check (package_quantity is null or package_quantity >= 0),
  loss_quantity numeric(16,4) generated always as (input_quantity - output_quantity) stored,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(company_id, id),
  foreign key (company_id, input_product_id) references public.products(company_id, id),
  foreign key (company_id, output_product_id) references public.products(company_id, id),
  foreign key (company_id, created_by_user_id) references public.memberships(company_id, user_id),
  check (input_product_id <> output_product_id),
  check (output_quantity <= input_quantity)
);
create index production_runs_occurred_idx
  on public.production_runs(company_id, occurred_on desc, id desc);

alter table public.production_runs owner to factupapa_migrator;
grant select, insert on public.production_runs to factupapa_api;
alter table public.production_runs enable row level security;
alter table public.production_runs force row level security;
create policy production_runs_tenant_isolation on public.production_runs
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
