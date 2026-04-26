create table if not exists app_settings (
  id text primary key,
  invoice_prefix text not null default 'FAC',
  invoice_year integer not null default extract(year from now()),
  next_invoice_number integer not null default 1,
  iban text not null default '',
  account_holder text not null default '',
  company_name text not null default '',
  company_nif text not null default '',
  company_address text not null default '',
  company_phone text not null default '',
  company_email text not null default '',
  drive_client_id text not null default '',
  drive_root_folder_name text not null default 'apPatatas',
  drive_auto_upload boolean not null default false,
  drive_state_file_name text not null default 'apPatatas-state.json',
  drive_state_auto_sync boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists app_aux_state (
  id text primary key,
  templates jsonb not null default '[]'::jsonb,
  delivery_notes jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (id)
values ('global')
on conflict (id) do nothing;

insert into app_aux_state (id)
values ('global')
on conflict (id) do nothing;
