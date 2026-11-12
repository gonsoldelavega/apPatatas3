-- Fotos y notas de voz en las notas comunes (p. ej. la foto de la carta de un bar o un audio del dueño).
-- Los archivos van al almacenamiento de objetos (MinIO); aquí solo queda su ficha.
-- Migración aditiva: solo crea una tabla nueva.

create table note_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  note_id uuid not null references shared_notes(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio')),
  mime_type text not null check (char_length(mime_type) between 3 and 60),
  byte_size integer not null check (byte_size > 0 and byte_size <= 8388608),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 600),
  storage_key text not null check (char_length(storage_key) between 1 and 300),
  created_by_user_id uuid not null,
  created_by_name text not null check (char_length(created_by_name) between 1 and 120),
  created_at timestamptz not null default now(),
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id)
);
create index note_attachments_note_idx on note_attachments (company_id, note_id, created_at);

alter table note_attachments owner to factupapa_migrator;
alter table note_attachments enable row level security;
alter table note_attachments force row level security;
create policy note_attachments_tenant_isolation on note_attachments
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

grant select, insert, delete on note_attachments to factupapa_api;
