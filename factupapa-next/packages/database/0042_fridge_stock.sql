-- «Stock en nevera»: bolsas o kg ya preparados de forma preventiva para entregar, por producto.
--
-- Es un recuento: la cantidad contada en el momento counted_at. Las ventas emitidas después (facturas
-- manuales y albaranes) la van descontando. No es una existencia aparte de la patata general: lo que
-- hay en la nevera ya forma parte de los kilos totales de patata.
-- Migración aditiva: solo crea una tabla nueva.

create table fridge_stock (
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null,
  quantity numeric(16, 4) not null check (quantity >= 0),
  counted_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500),
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, product_id),
  foreign key (company_id, product_id) references products(company_id, id),
  foreign key (company_id, updated_by_user_id) references memberships(company_id, user_id)
);

alter table fridge_stock owner to factupapa_migrator;
alter table fridge_stock enable row level security;
alter table fridge_stock force row level security;
create policy fridge_stock_tenant_isolation on fridge_stock
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create trigger fridge_stock_set_updated_at before update on fridge_stock for each row execute function set_updated_at();

grant select, insert, update, delete on fridge_stock to factupapa_api;
