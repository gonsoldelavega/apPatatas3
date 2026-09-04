create or replace function public.claim_sales_invoice_export_events(p_limit integer)
returns table(id uuid, company_id uuid, invoice_id uuid)
language sql security definer set search_path = public as $$
  with picked as (
    select e.id from sales_invoice_export_events e
    where ((e.status in ('pending','failed') and e.next_attempt_at <= now()) or (e.status='processing' and e.processing_at < now() - interval '15 minutes'))
    order by e.created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  update sales_invoice_export_events e
  set status='processing', processing_at=now(), attempt_count=e.attempt_count+1, updated_at=now()
  from picked where e.id=picked.id
  returning e.id,e.company_id,e.invoice_id;
$$;
grant execute on function public.claim_sales_invoice_export_events(integer) to factupapa_api;

create or replace function public.claim_purchase_invoice_export_events(p_limit integer default 10)
returns table(id uuid, company_id uuid, purchase_invoice_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  return query with picked as (
    select e.id from purchase_invoice_export_events e
    where ((e.status in ('pending','failed') and e.next_attempt_at <= now()) or (e.status='processing' and e.processing_at < now() - interval '15 minutes'))
    order by e.created_at for update skip locked limit greatest(1,least(p_limit,100))
  )
  update purchase_invoice_export_events e
  set status='processing', processing_at=now(), attempt_count=e.attempt_count+1, updated_at=now()
  from picked where e.id=picked.id
  returning e.id,e.company_id,e.purchase_invoice_id;
end $$;
grant execute on function public.claim_purchase_invoice_export_events(integer) to factupapa_api;

alter table purchase_invoice_export_events
  add column if not exists exported_without_document boolean not null default false;
