alter table public.gmail_integrations
  add column if not exists inbox_cursor_at timestamptz,
  add column if not exists last_inbox_messages integer not null default 0,
  add column if not exists last_inbox_imported integer not null default 0,
  add column if not exists last_inbox_duplicates integer not null default 0,
  add column if not exists last_inbox_review integer not null default 0,
  add column if not exists last_inbox_errors integer not null default 0;

-- Existing installations have already been syncing. Seed a conservative cursor
-- near their last execution instead of replaying the whole mailbox on deploy.
update public.gmail_integrations
set inbox_cursor_at = coalesce(
  inbox_cursor_at,
  last_inbox_sync_at - interval '8 hours',
  now() - interval '24 hours'
)
where inbox_cursor_at is null;

alter table public.gmail_integrations
  drop constraint if exists gmail_integrations_inbox_metric_counts_check;
alter table public.gmail_integrations
  add constraint gmail_integrations_inbox_metric_counts_check
  check (
    last_inbox_messages >= 0 and
    last_inbox_imported >= 0 and
    last_inbox_duplicates >= 0 and
    last_inbox_review >= 0 and
    last_inbox_errors >= 0
  );

-- Scheduler remains exactly one due claim per six hours. inbox_cursor_at is
-- deliberately NOT modified here: it advances only after a complete sync.
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
