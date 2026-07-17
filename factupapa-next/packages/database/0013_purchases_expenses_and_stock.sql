create type purchase_invoice_status as enum ('draft', 'confirmed', 'cancelled');
create type stock_adjustment_reason as enum ('initial', 'purchase', 'sale', 'loss', 'correction', 'other');

alter table documents add constraint documents_company_id_id_key unique (company_id, id);

create table purchase_invoices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  supplier_id uuid, supplier_legal_name text, supplier_tax_id text, supplier_address jsonb, document_id uuid,
  supplier_invoice_number text, issue_date date not null, due_date date, status purchase_invoice_status not null default 'draft',
  category text not null default 'mercancia' check (category in ('mercancia','autonomo','gestoria','transporte','suministros','alquiler','impuestos','otros')),
  subtotal numeric(16,4) not null default 0 check (subtotal >= 0), tax_total numeric(16,4) not null default 0 check (tax_total >= 0),
  total numeric(16,4) not null default 0 check (total >= 0), notes text check (notes is null or char_length(notes) <= 4000),
  created_by_user_id uuid not null, confirmed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, id),
  foreign key (company_id, supplier_id) references contacts(company_id, id),
  foreign key (company_id, document_id) references documents(company_id, id),
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id),
  check (supplier_invoice_number is null or char_length(supplier_invoice_number) <= 100),
  check (supplier_address is null or jsonb_typeof(supplier_address) = 'object'),
  check ((status = 'confirmed') = (confirmed_at is not null)), check ((status = 'cancelled') = (cancelled_at is not null))
);
create unique index purchase_invoices_supplier_number_unique_idx on purchase_invoices(company_id, supplier_id, lower(btrim(supplier_invoice_number))) where supplier_id is not null and supplier_invoice_number is not null and btrim(supplier_invoice_number) <> '' and status <> 'cancelled';
create unique index purchase_invoices_document_unique_idx on purchase_invoices(company_id, document_id) where document_id is not null;
create index purchase_invoices_list_idx on purchase_invoices(company_id, issue_date desc, id desc);

create table purchase_invoice_lines (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade,
  purchase_invoice_id uuid not null, product_id uuid, description text not null check (char_length(btrim(description)) between 1 and 500),
  quantity numeric(16,4) not null check (quantity > 0), unit text not null check (unit in ('kg','g','unit','box','custom')),
  unit_cost numeric(16,4) not null check (unit_cost >= 0), tax_rate numeric(6,3) not null check (tax_rate between 0 and 100),
  line_subtotal numeric(16,4) not null check (line_subtotal >= 0), line_tax numeric(16,4) not null check (line_tax >= 0),
  line_total numeric(16,4) not null check (line_total >= 0), position integer not null check (position > 0),
  unique(company_id, purchase_invoice_id, position),
  foreign key (company_id, purchase_invoice_id) references purchase_invoices(company_id, id) on delete cascade,
  foreign key (company_id, product_id) references products(company_id, id)
);

create table recurring_expenses (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade, supplier_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 200), category text not null check (category in ('autonomo','gestoria','transporte','suministros','alquiler','impuestos','otros')),
  amount numeric(16,4) not null check (amount >= 0), tax_rate numeric(6,3) not null default 0 check (tax_rate between 0 and 100),
  charge_day integer not null default 1 check (charge_day between 1 and 28), starts_on date not null, ends_on date, is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 2000), created_by_user_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (company_id, supplier_id) references contacts(company_id, id), foreign key (company_id, created_by_user_id) references memberships(company_id, user_id),
  check (ends_on is null or ends_on >= starts_on)
);
create index recurring_expenses_active_idx on recurring_expenses(company_id, is_active, starts_on, ends_on);

create table stock_adjustments (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id) on delete cascade, product_id uuid not null,
  occurred_on date not null, quantity_delta numeric(16,4) not null check (quantity_delta <> 0), reason stock_adjustment_reason not null,
  note text check (note is null or char_length(note) <= 1000), created_by_user_id uuid not null, created_at timestamptz not null default now(),
  foreign key (company_id, product_id) references products(company_id, id), foreign key (company_id, created_by_user_id) references memberships(company_id, user_id)
);
create index stock_adjustments_product_idx on stock_adjustments(company_id, product_id, occurred_on, id);

create function enforce_purchase_invoice_state() returns trigger language plpgsql set search_path = pg_catalog, public as $function$
declare calculated record;
begin
  if new.company_id is distinct from old.company_id then raise exception 'company_id is immutable' using errcode = '55000'; end if;
  if old.status <> 'draft' then raise exception 'Confirmed or cancelled purchases are immutable' using errcode = '55000'; end if;
  if new.status = 'draft' then return new; end if;
  if new.status = 'confirmed' then
    if new.supplier_id is null or new.supplier_invoice_number is null or btrim(new.supplier_invoice_number) = '' or new.confirmed_at is null or new.cancelled_at is not null then raise exception 'A confirmed purchase requires supplier, number and confirmation timestamp' using errcode = '23514'; end if;
    select count(*) count,coalesce(sum(line_subtotal),0) subtotal,coalesce(sum(line_tax),0) tax_total,coalesce(sum(line_total),0) total into calculated from purchase_invoice_lines where company_id=old.company_id and purchase_invoice_id=old.id;
    if calculated.count=0 or new.subtotal<>calculated.subtotal or new.tax_total<>calculated.tax_total or new.total<>calculated.total then raise exception 'Purchase totals do not match its lines' using errcode = '23514'; end if;
    if (to_jsonb(new)-array['status','confirmed_at','updated_at'])<>(to_jsonb(old)-array['status','confirmed_at','updated_at']) then raise exception 'Purchase data cannot change during confirmation' using errcode = '55000'; end if;
    return new;
  end if;
  if new.status = 'cancelled' and new.cancelled_at is not null and new.confirmed_at is null and (to_jsonb(new)-array['status','cancelled_at','updated_at'])=(to_jsonb(old)-array['status','cancelled_at','updated_at']) then return new; end if;
  raise exception 'Invalid purchase transition' using errcode = '55000';
end $function$;

create function enforce_purchase_line_state() returns trigger language plpgsql set search_path = pg_catalog, public as $function$
declare old_status text; new_status text;
begin
  if tg_op in ('UPDATE','DELETE') then select status::text into old_status from purchase_invoices where company_id=old.company_id and id=old.purchase_invoice_id; end if;
  if tg_op in ('INSERT','UPDATE') then select status::text into new_status from purchase_invoices where company_id=new.company_id and id=new.purchase_invoice_id; end if;
  if tg_op='UPDATE' and new.company_id is distinct from old.company_id then raise exception 'company_id is immutable' using errcode='55000'; end if;
  if tg_op in ('UPDATE','DELETE') and old_status is distinct from 'draft' then raise exception 'Lines of a confirmed purchase are immutable' using errcode='55000'; end if;
  if tg_op in ('INSERT','UPDATE') and new_status is distinct from 'draft' then raise exception 'Purchase lines require a draft parent' using errcode='55000'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $function$;

create trigger purchase_invoices_enforce_state before update on purchase_invoices for each row execute function enforce_purchase_invoice_state();
create trigger purchase_invoice_lines_enforce_state before insert or update or delete on purchase_invoice_lines for each row execute function enforce_purchase_line_state();
create trigger purchase_invoices_set_updated_at before update on purchase_invoices for each row execute function set_updated_at();
create trigger recurring_expenses_set_updated_at before update on recurring_expenses for each row execute function set_updated_at();

alter type purchase_invoice_status owner to factupapa_migrator; alter type stock_adjustment_reason owner to factupapa_migrator;
alter function enforce_purchase_invoice_state() owner to factupapa_migrator; alter function enforce_purchase_line_state() owner to factupapa_migrator;
alter table purchase_invoices owner to factupapa_migrator; alter table purchase_invoice_lines owner to factupapa_migrator; alter table recurring_expenses owner to factupapa_migrator; alter table stock_adjustments owner to factupapa_migrator;
grant select, insert, update on purchase_invoices to factupapa_api; grant select, insert, update, delete on purchase_invoice_lines to factupapa_api;
grant select, insert, update on recurring_expenses to factupapa_api; grant select, insert on stock_adjustments to factupapa_api;
revoke all on function enforce_purchase_invoice_state() from public; revoke all on function enforce_purchase_line_state() from public;
grant execute on function enforce_purchase_invoice_state() to factupapa_api; grant execute on function enforce_purchase_line_state() to factupapa_api;

do $rls$ declare protected_table text; begin
  foreach protected_table in array array['purchase_invoices','purchase_invoice_lines','recurring_expenses','stock_adjustments'] loop
    execute format('alter table public.%I enable row level security', protected_table); execute format('alter table public.%I force row level security', protected_table);
    execute format('create policy %I on public.%I for all using (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid) with check (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid)', protected_table || '_tenant_isolation', protected_table);
  end loop;
end $rls$;
