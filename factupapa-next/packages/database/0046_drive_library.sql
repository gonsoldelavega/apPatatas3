-- Biblioteca de Drive: copia de la lista de archivos de la carpeta de gestión (nombre, carpeta, enlace),
-- para que la app muestre todo lo que hay en Drive y diga qué falta por registrar.
-- Solo guarda datos de cada archivo (no su contenido). Migración aditiva: solo tablas nuevas.

create table drive_files (
  company_id uuid not null references companies(id) on delete cascade,
  drive_id text not null check (char_length(drive_id) between 5 and 200),
  name text not null check (char_length(name) <= 500),
  mime_type text not null check (char_length(mime_type) <= 200),
  path text not null default '' check (char_length(path) <= 1000),
  modified_at timestamptz,
  size_bytes bigint,
  web_view_link text check (web_view_link is null or char_length(web_view_link) <= 2000),
  seen_at timestamptz not null default now(),
  primary key (company_id, drive_id)
);
create index drive_files_company_path_idx on drive_files (company_id, path);
create index drive_files_company_name_idx on drive_files (company_id, name);

create table drive_library_state (
  company_id uuid primary key references companies(id) on delete cascade,
  last_sync_at timestamptz,
  last_status text check (last_status is null or last_status in ('running', 'ok', 'error')),
  last_file_count integer not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 300)
);

do $drive$
declare
  drive_table text;
begin
  foreach drive_table in array array['drive_files', 'drive_library_state'] loop
    execute format('alter table public.%I owner to factupapa_migrator', drive_table);
    execute format('alter table public.%I enable row level security', drive_table);
    execute format('alter table public.%I force row level security', drive_table);
    execute format(
      'create policy %I on public.%I for all using (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid) with check (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid)',
      drive_table || '_tenant_isolation', drive_table
    );
    execute format('grant select, insert, update, delete on public.%I to factupapa_api', drive_table);
  end loop;
end
$drive$;
