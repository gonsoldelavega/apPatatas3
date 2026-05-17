-- Proposal only. Do not run against production without review, backup, and RLS policy validation.

create table if not exists public.processed_documents (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  file_hash text,
  file_name text,
  supplier_nif text,
  supplier_name text,
  invoice_number text,
  invoice_date date,
  total_amount numeric(12,2),
  status text not null default 'pendiente_revision',
  confidence numeric(4,3) not null default 0,
  target_table text,
  target_record_id text,
  raw_text text,
  ai_json jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint processed_documents_status_check check (
    status in ('pendiente_revision', 'duplicado', 'procesado', 'error_lectura', 'omitido')
  )
);

create index if not exists processed_documents_supplier_invoice_idx
  on public.processed_documents (supplier_nif, invoice_number, invoice_date);

create index if not exists processed_documents_status_idx
  on public.processed_documents (status, created_at desc);

create unique index if not exists processed_documents_probable_duplicate_idx
  on public.processed_documents (supplier_nif, invoice_number, invoice_date, total_amount)
  where supplier_nif is not null and invoice_number is not null;

-- Suggested RLS direction:
-- alter table public.processed_documents enable row level security;
-- Allow frontend read of review status only if needed.
-- Keep inserts/updates for backend/n8n service context, not the public frontend.
