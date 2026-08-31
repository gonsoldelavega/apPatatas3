create or replace function public.claim_sales_invoice_export_events(p_limit integer)
returns table(id uuid, company_id uuid, invoice_id uuid)
language sql
security definer
set search_path = public
as $$
  with picked as (
    select e.id
    from sales_invoice_export_events e
    where e.status in ('pending','failed') and e.next_attempt_at <= now()
    order by e.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  )
  update sales_invoice_export_events e
  set status='processing', processing_at=now(), attempt_count=e.attempt_count+1, updated_at=now()
  from picked
  where e.id=picked.id
  returning e.id,e.company_id,e.invoice_id;
$$;
grant execute on function public.claim_sales_invoice_export_events(integer) to factupapa_api;
