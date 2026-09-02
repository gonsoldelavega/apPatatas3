create table if not exists purchase_invoice_export_events(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references companies(id), purchase_invoice_id uuid not null references purchase_invoices(id),
 event_type text not null default 'purchase_invoice_export_requested', status text not null default 'pending', attempt_count integer not null default 0,
 last_error text, next_attempt_at timestamptz not null default now(), processing_at timestamptz, completed_at timestamptz, drive_file_id text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,purchase_invoice_id,event_type)
);
create index if not exists purchase_invoice_export_due on purchase_invoice_export_events(status,next_attempt_at);
create or replace function claim_purchase_invoice_export_events(p_limit integer default 10) returns table(id uuid, company_id uuid, purchase_invoice_id uuid) language plpgsql security definer as $$
begin
 return query with picked as (select e.id from purchase_invoice_export_events e where e.status in ('pending','failed') and e.next_attempt_at<=now() order by e.created_at for update skip locked limit p_limit)
 update purchase_invoice_export_events e set status='processing',processing_at=now(),attempt_count=e.attempt_count+1,updated_at=now() from picked where e.id=picked.id returning e.id,e.company_id,e.purchase_invoice_id;
end $$;
