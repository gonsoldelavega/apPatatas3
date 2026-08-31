create table if not exists sales_invoice_export_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  invoice_id uuid not null references invoices(id),
  event_type text not null default 'sales_invoice_export_requested',
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempt_count integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  processing_at timestamptz,
  completed_at timestamptz,
  drive_file_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, invoice_id, event_type)
);
create index if not exists sales_invoice_export_events_due_idx
  on sales_invoice_export_events(status, next_attempt_at);
alter table sales_invoice_export_events enable row level security;
create policy sales_invoice_export_events_tenant on sales_invoice_export_events
  using (company_id = current_setting('app.current_company_id', true)::uuid)
  with check (company_id = current_setting('app.current_company_id', true)::uuid);
