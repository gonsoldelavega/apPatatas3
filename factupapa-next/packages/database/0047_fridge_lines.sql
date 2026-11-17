-- «Bolsas hechas»: cada tirada que entra en la nevera, con su tipo (bastón con/sin piel, brava, panadera,
-- gajo…) y, si se quiere, para qué cliente es.
--
-- Es un desglose de lo que hay en fridge_stock: al crear una línea se suma esa cantidad a la nevera de
-- la variedad (el stock de patata en general ya la contaba). Marcar «entregada» solo la quita de la
-- lista: el descuento de la nevera lo hacen las ventas, como hasta ahora.
-- Migración aditiva: solo crea una tabla nueva.

create table fridge_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  variety text not null check (char_length(variety) between 1 and 60),
  product_id uuid not null,
  contact_id uuid,
  quantity numeric(16, 4) not null check (quantity > 0),
  bags numeric(12, 2) check (bags is null or bags > 0),
  note text check (note is null or char_length(note) <= 300),
  delivered_at timestamptz,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, product_id) references products(company_id, id),
  foreign key (company_id, contact_id) references contacts(company_id, id),
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id)
);

create index fridge_lines_open_idx on fridge_lines (company_id, created_at desc) where delivered_at is null;

alter table fridge_lines owner to factupapa_migrator;
alter table fridge_lines enable row level security;
alter table fridge_lines force row level security;
create policy fridge_lines_tenant_isolation on fridge_lines
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create trigger fridge_lines_set_updated_at before update on fridge_lines for each row execute function set_updated_at();

grant select, insert, update, delete on fridge_lines to factupapa_api;
