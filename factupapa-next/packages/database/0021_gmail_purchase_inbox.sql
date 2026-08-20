alter table public.gmail_integrations
  add column if not exists last_inbox_sync_at timestamptz,
  add column if not exists last_inbox_sync_status text,
  add column if not exists last_inbox_sync_error text;

create table if not exists public.gmail_purchase_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  gmail_message_id text not null,
  gmail_attachment_id text not null,
  sender_email text,
  subject text,
  received_at timestamptz,
  original_filename text not null,
  document_id uuid,
  status text not null default 'processing'
    check (status in ('processing','needs_review','duplicate','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, gmail_message_id, gmail_attachment_id),
  constraint gmail_purchase_imports_document_company_fk
    foreign key (company_id, document_id)
    references public.documents(company_id, id) on delete set null (document_id)
);

create index if not exists gmail_purchase_imports_company_status_idx
  on public.gmail_purchase_imports(company_id, status, received_at desc);

grant select, insert, update, delete on public.gmail_purchase_imports to factupapa_api;

alter table public.gmail_purchase_imports enable row level security;
alter table public.gmail_purchase_imports force row level security;
create policy gmail_purchase_imports_tenant_isolation on public.gmail_purchase_imports
  for all
  using (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid)
  with check (company_id = nullif(current_setting('app.current_company_id', true), '')::uuid);

create or replace function public.claim_due_gmail_inbox_syncs(p_limit integer default 20)
returns table(company_id uuid, user_id uuid)
language sql
security definer
set search_path = pg_catalog, public
as $$
  with due as (
    select g.company_id, g.connected_by_user_id
    from public.gmail_integrations g
    where 'https://www.googleapis.com/auth/gmail.readonly' = any(g.scopes)
      and (g.last_inbox_sync_at is null or g.last_inbox_sync_at <= now() - interval '6 hours')
    order by g.last_inbox_sync_at nulls first
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.gmail_integrations g
    set last_inbox_sync_at = now(), last_inbox_sync_status = 'running',
        last_inbox_sync_error = null, updated_at = now()
    from due
    where g.company_id = due.company_id
    returning g.company_id, due.connected_by_user_id
  )
  select claimed.company_id, claimed.connected_by_user_id from claimed;
$$;

revoke all on function public.claim_due_gmail_inbox_syncs(integer) from public;
grant execute on function public.claim_due_gmail_inbox_syncs(integer) to factupapa_api;
