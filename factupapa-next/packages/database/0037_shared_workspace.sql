-- Espacio compartido del equipo: pedidos con avance parcial, tareas, notas comunes y
-- cuentas entre los dos núcleos familiares (reparto 50 %).
-- Migración aditiva: solo crea tablas nuevas. No toca datos ni tablas existentes.
--
-- Nota sobre nombres: la tabla users solo deja ver la propia fila (RLS), así que quien
-- crea o marca algo se guarda como nombre "foto" en cada registro (created_by_name...).

-- ── Pedidos de clientes con checklist parcial ──────────────────────────────────
create table customer_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid not null,
  due_date date,
  notes text check (notes is null or char_length(notes) <= 4000),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by_user_id uuid not null,
  created_by_name text not null check (char_length(created_by_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  unique (company_id, id),
  foreign key (company_id, contact_id) references contacts(company_id, id),
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'cancelled') = (cancelled_at is not null))
);

create table customer_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_id uuid not null,
  position integer not null default 0,
  product_id uuid,
  description text not null check (char_length(description) between 1 and 200),
  unit text not null check (unit in ('kg', 'bolsa', 'unidad')),
  quantity_ordered numeric(12, 3) not null check (quantity_ordered > 0),
  quantity_done numeric(12, 3) not null default 0 check (quantity_done >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, order_id) references customer_orders(company_id, id) on delete cascade,
  foreign key (company_id, product_id) references products(company_id, id),
  check (quantity_done <= quantity_ordered)
);
create index customer_order_lines_order_idx on customer_order_lines (company_id, order_id, position);
create index customer_orders_open_idx on customer_orders (company_id, status, due_date);

-- Histórico de avances: quién marcó cuánto y cuándo (incluye correcciones negativas).
create table customer_order_progress (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  order_line_id uuid not null,
  delta numeric(12, 3) not null check (delta <> 0),
  done_after numeric(12, 3) not null check (done_after >= 0),
  created_by_user_id uuid not null,
  created_by_name text not null check (char_length(created_by_name) between 1 and 120),
  created_at timestamptz not null default now(),
  foreign key (company_id, order_line_id) references customer_order_lines(company_id, id) on delete cascade,
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id)
);
create index customer_order_progress_line_idx on customer_order_progress (company_id, order_line_id, created_at);

-- ── Tareas ─────────────────────────────────────────────────────────────────────
create table shared_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  details text check (details is null or char_length(details) <= 4000),
  contact_id uuid,
  assigned_side text check (assigned_side in ('side_a', 'side_b')),
  due_date date,
  done_at timestamptz,
  done_by_name text check (done_by_name is null or char_length(done_by_name) between 1 and 120),
  created_by_user_id uuid not null,
  created_by_name text not null check (char_length(created_by_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (company_id, contact_id) references contacts(company_id, id),
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id),
  check ((done_at is null) = (done_by_name is null))
);
create index shared_tasks_open_idx on shared_tasks (company_id, done_at, due_date) where deleted_at is null;

-- ── Notas comunes (p. ej. lo que ha dicho cada bar, nombre del dueño, tipo de patata) ──
create table shared_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  contact_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 8000),
  pinned boolean not null default false,
  created_by_user_id uuid not null,
  created_by_name text not null check (char_length(created_by_name) between 1 and 120),
  updated_by_name text not null check (char_length(updated_by_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (company_id, contact_id) references contacts(company_id, id),
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id)
);
create index shared_notes_company_idx on shared_notes (company_id, pinned desc, updated_at desc) where archived_at is null;
create index shared_notes_contact_idx on shared_notes (company_id, contact_id) where archived_at is null;

-- ── Cuentas entre los dos núcleos (50 % / 50 %) ────────────────────────────────
create table shared_ledger_settings (
  company_id uuid primary key references companies(id) on delete cascade,
  side_a_name text not null default 'Irene y Nando' check (char_length(side_a_name) between 1 and 60),
  side_b_name text not null default 'Roberto y Gemma' check (char_length(side_b_name) between 1 and 60),
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid not null
);

-- kind: expense (gasto pagado por el núcleo), income (ingreso cobrado por el núcleo),
--       settlement (pago de liquidación: el núcleo `side` paga al otro).
create table shared_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  entry_date date not null,
  kind text not null check (kind in ('expense', 'income', 'settlement')),
  side text not null check (side in ('side_a', 'side_b')),
  amount numeric(14, 2) not null check (amount > 0),
  concept text not null check (char_length(concept) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by_user_id uuid not null,
  created_by_name text not null check (char_length(created_by_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_name text,
  foreign key (company_id, created_by_user_id) references memberships(company_id, user_id),
  check ((deleted_at is null) = (deleted_by_name is null))
);
create index shared_ledger_entries_company_idx on shared_ledger_entries (company_id, entry_date desc, created_at desc) where deleted_at is null;

-- ── Propiedad, disparadores, permisos y seguridad por filas ────────────────────
do $workspace$
declare
  workspace_table text;
begin
  foreach workspace_table in array array[
    'customer_orders', 'customer_order_lines', 'customer_order_progress',
    'shared_tasks', 'shared_notes', 'shared_ledger_settings', 'shared_ledger_entries'
  ] loop
    execute format('alter table public.%I owner to factupapa_migrator', workspace_table);
    execute format('alter table public.%I enable row level security', workspace_table);
    execute format('alter table public.%I force row level security', workspace_table);
    execute format(
      'create policy %I on public.%I for all using (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid) with check (company_id = nullif(current_setting(''app.current_company_id'', true), '''')::uuid)',
      workspace_table || '_tenant_isolation', workspace_table
    );
  end loop;
end
$workspace$;

create trigger customer_orders_set_updated_at before update on customer_orders for each row execute function set_updated_at();
create trigger customer_order_lines_set_updated_at before update on customer_order_lines for each row execute function set_updated_at();
create trigger shared_tasks_set_updated_at before update on shared_tasks for each row execute function set_updated_at();
create trigger shared_notes_set_updated_at before update on shared_notes for each row execute function set_updated_at();
create trigger shared_ledger_settings_set_updated_at before update on shared_ledger_settings for each row execute function set_updated_at();
create trigger shared_ledger_entries_set_updated_at before update on shared_ledger_entries for each row execute function set_updated_at();

-- Sin DELETE salvo en líneas de pedido sin avance (el resto se archiva o se marca como borrado).
grant select, insert, update on customer_orders to factupapa_api;
grant select, insert, update, delete on customer_order_lines to factupapa_api;
grant select, insert on customer_order_progress to factupapa_api;
grant select, insert, update on shared_tasks to factupapa_api;
grant select, insert, update on shared_notes to factupapa_api;
grant select, insert, update on shared_ledger_settings to factupapa_api;
grant select, insert, update on shared_ledger_entries to factupapa_api;
