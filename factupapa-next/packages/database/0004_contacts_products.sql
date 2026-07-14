alter table contacts
  add column notes text,
  add column is_active boolean not null default true;

alter table contacts
  add constraint contacts_legal_name_length_check check (char_length(btrim(legal_name)) between 1 and 200),
  add constraint contacts_trade_name_length_check check (trade_name is null or char_length(trade_name) <= 200),
  add constraint contacts_tax_id_length_check check (tax_id is null or char_length(tax_id) <= 32),
  add constraint contacts_email_length_check check (email is null or char_length(email) <= 320),
  add constraint contacts_phone_length_check check (phone is null or char_length(phone) <= 32),
  add constraint contacts_address_object_check check (jsonb_typeof(address) = 'object'),
  add constraint contacts_notes_length_check check (notes is null or char_length(notes) <= 4000);

create unique index contacts_company_tax_id_unique_idx
  on contacts(company_id, lower(btrim(tax_id)))
  where tax_id is not null and btrim(tax_id) <> '';
create index contacts_company_active_name_idx
  on contacts(company_id, is_active, lower(legal_name), id);
create index contacts_company_email_idx on contacts(company_id, lower(email)) where email is not null;
create index contacts_company_phone_idx on contacts(company_id, phone) where phone is not null;

alter table products rename column active to is_active;
alter table products add column description text;
update products set sale_price = 0 where sale_price is null;
alter table products alter column sale_price set not null;

alter table products
  add constraint products_name_length_check check (char_length(btrim(name)) between 1 and 200),
  add constraint products_description_length_check check (description is null or char_length(description) <= 4000),
  add constraint products_sku_length_check check (sku is null or char_length(sku) <= 64),
  add constraint products_unit_check check (unit in ('kg', 'g', 'unit', 'box', 'custom')),
  add constraint products_sale_price_check check (sale_price >= 0),
  add constraint products_estimated_cost_check check (estimated_cost is null or estimated_cost >= 0),
  add constraint products_tax_rate_check check (tax_rate >= 0 and tax_rate <= 100);

drop index products_company_active_idx;
create index products_company_active_name_idx
  on products(company_id, is_active, lower(name), id);
create unique index products_company_sku_unique_idx
  on products(company_id, lower(btrim(sku)))
  where sku is not null and btrim(sku) <> '';

create table contact_product_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  contact_id uuid not null,
  product_id uuid not null,
  price numeric(14,4) not null check (price >= 0),
  valid_from date not null default current_date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_product_prices_company_fk
    foreign key (company_id) references companies(id) on delete cascade,
  constraint contact_product_prices_contact_fk
    foreign key (company_id, contact_id) references contacts(company_id, id) on delete cascade,
  constraint contact_product_prices_product_fk
    foreign key (company_id, product_id) references products(company_id, id) on delete cascade,
  constraint contact_product_prices_company_contact_product_key
    unique (company_id, contact_id, product_id)
);

create index contact_product_prices_effective_idx
  on contact_product_prices(company_id, contact_id, is_active, valid_from, product_id);

create function set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  new.updated_at = now();
  return new;
end
$function$;

create trigger contacts_set_updated_at
before update on contacts
for each row execute function set_updated_at();

create trigger products_set_updated_at
before update on products
for each row execute function set_updated_at();

create trigger contact_product_prices_set_updated_at
before update on contact_product_prices
for each row execute function set_updated_at();

alter table contact_product_prices owner to factupapa_migrator;
alter function set_updated_at() owner to factupapa_migrator;
revoke all on function set_updated_at() from public;
grant execute on function set_updated_at() to factupapa_api;
grant select, insert, update, delete on contact_product_prices to factupapa_api;

alter table contact_product_prices enable row level security;
alter table contact_product_prices force row level security;
create policy contact_product_prices_tenant_isolation on contact_product_prices
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);
