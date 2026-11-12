-- Personas de contacto de cada cliente o proveedor: nombre, cargo (encargado, dueño...) y teléfono móvil.
-- Migración aditiva: solo crea una tabla nueva.

create table contact_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  role text check (role is null or char_length(role) <= 60),
  phone text check (phone is null or char_length(phone) <= 30),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, contact_id) references contacts(company_id, id) on delete cascade
);
create index contact_people_contact_idx on contact_people (company_id, contact_id, position, created_at);

alter table contact_people owner to factupapa_migrator;
alter table contact_people enable row level security;
alter table contact_people force row level security;
create policy contact_people_tenant_isolation on contact_people
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create trigger contact_people_set_updated_at before update on contact_people for each row execute function set_updated_at();

grant select, insert, update, delete on contact_people to factupapa_api;
