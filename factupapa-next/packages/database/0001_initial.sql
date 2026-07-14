begin;

create extension if not exists pgcrypto;

create type document_status as enum ('uploaded','processing','needs_review','validated','rejected','archived');
create type invoice_status as enum ('draft','issued','partially_paid','paid','overdue','cancelled');
create type document_kind as enum ('purchase_invoice','sales_invoice','receipt','delivery_note','quote','other');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  currency char(3) not null default 'EUR',
  timezone text not null default 'Europe/Madrid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  display_name text not null,
  password_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member','viewer')),
  primary key (organization_id, user_id)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('customer','supplier','both')),
  legal_name text not null,
  trade_name text,
  tax_id text,
  email text,
  phone text,
  address jsonb not null default '{}'::jsonb,
  payment_terms_days integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_org_kind_idx on contacts(organization_id, kind);

create table products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'unit',
  sale_price numeric(14,4),
  estimated_cost numeric(14,4),
  tax_rate numeric(6,3) not null default 21,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(id),
  direction text not null check (direction in ('sale','purchase')),
  series text not null,
  number integer not null,
  issue_date date not null,
  due_date date,
  status invoice_status not null default 'draft',
  subtotal numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid_total numeric(14,2) not null default 0,
  notes text,
  source text not null default 'native',
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, direction, series, number)
);
create index invoices_org_status_idx on invoices(organization_id, status, issue_date desc);

create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid references products(id),
  description text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,4) not null,
  tax_rate numeric(6,3) not null,
  discount_rate numeric(6,3) not null default 0,
  line_total numeric(14,2) not null,
  position integer not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  direction text not null check (direction in ('incoming','outgoing')),
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null,
  method text,
  reference text,
  created_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  kind document_kind not null,
  status document_status not null default 'uploaded',
  original_filename text not null,
  storage_key text unique not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null,
  captured_at timestamptz,
  uploaded_by uuid references users(id) on delete set null,
  ocr_provider text,
  ocr_confidence numeric(5,4),
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_org_status_idx on documents(organization_id, status, created_at desc);

create table audit_events (
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_entity_idx on audit_events(organization_id, entity_type, entity_id, created_at desc);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  source text not null,
  mode text not null default 'copy_only' check (mode = 'copy_only'),
  status text not null check (status in ('planned','running','completed','failed','rolled_back')),
  source_snapshot_sha256 text,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

commit;
