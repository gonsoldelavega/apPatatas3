-- Borrar una factura emitida por error y liberar su número.
--
-- Las facturas emitidas son inmutables y no se pueden borrar. Esta función es la única puerta, y es
-- deliberadamente estrecha para no dejar huecos ni romper nada:
--   * solo el usuario maestro (owner);
--   * solo la factura con el número MÁS ALTO de su serie (así el siguiente número vuelve a ser el suyo);
--   * sin cobros ni documentos asociados;
--   * los albaranes que incluía se reabren (como al cancelar);
--   * la secuencia vuelve a ese número;
--   * queda en auditoría una copia completa de lo borrado.
-- Migración aditiva: solo crea una función nueva.

create function public.delete_mistaken_sales_invoice(p_invoice_id uuid)
returns table (series text, number integer, drive_file_id text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  tenant_id uuid;
  actor_id uuid;
  inv public.invoices%rowtype;
  snapshot jsonb;
  exported_file text;
begin
  tenant_id := nullif(current_setting('app.current_company_id', true), '')::uuid;
  actor_id := nullif(current_setting('app.current_user_id', true), '')::uuid;

  if tenant_id is null or actor_id is null or not exists (
    select 1 from public.memberships m
    join public.users u on u.id = m.user_id
    where m.company_id = tenant_id and m.user_id = actor_id and m.role = 'owner' and u.is_active
  ) then
    raise exception 'Only the owner can delete an invoice' using errcode = '42501';
  end if;

  select i.* into inv from public.invoices i
  where i.company_id = tenant_id and i.id = p_invoice_id and i.direction = 'sale'
  for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if inv.status not in ('issued', 'cancelled') or inv.number is null then
    raise exception 'Only an issued invoice can be deleted this way' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.invoices o
    where o.company_id = tenant_id and o.direction = 'sale' and o.series = inv.series
      and o.number > inv.number
  ) then
    raise exception 'Only the last invoice of the series can be deleted' using errcode = '55000';
  end if;
  if exists (select 1 from public.payments p where p.company_id = tenant_id and p.invoice_id = p_invoice_id)
     or exists (select 1 from public.documents d where d.company_id = tenant_id and d.invoice_id = p_invoice_id) then
    raise exception 'The invoice has payments or documents' using errcode = '55000';
  end if;

  snapshot := jsonb_build_object(
    'invoice', to_jsonb(inv),
    'lines', coalesce((select jsonb_agg(to_jsonb(l) order by l.position) from public.invoice_lines l
                       where l.company_id = tenant_id and l.invoice_id = p_invoice_id), '[]'::jsonb),
    'deliveryNoteIds', coalesce((select jsonb_agg(k.delivery_note_id) from public.invoice_delivery_notes k
                                 where k.company_id = tenant_id and k.invoice_id = p_invoice_id), '[]'::jsonb)
  );

  -- Los albaranes vuelven a estar disponibles (mismo camino que al cancelar).
  if inv.status = 'issued' then
    perform public.cancel_sales_invoice(p_invoice_id);
  end if;

  select e.drive_file_id into exported_file from public.sales_invoice_export_events e
  where e.company_id = tenant_id and e.invoice_id = p_invoice_id and e.drive_file_id is not null
  limit 1;

  alter table public.invoices disable trigger invoices_enforce_immutability;
  alter table public.invoice_lines disable trigger invoice_lines_enforce_immutability;
  alter table public.invoice_delivery_notes disable trigger invoice_delivery_notes_enforce_integrity;

  delete from public.sales_invoice_export_events where company_id = tenant_id and invoice_id = p_invoice_id;
  delete from public.invoice_delivery_notes where company_id = tenant_id and invoice_id = p_invoice_id;
  delete from public.invoice_lines where company_id = tenant_id and invoice_id = p_invoice_id;
  delete from public.invoices where company_id = tenant_id and id = p_invoice_id;

  alter table public.invoices enable trigger invoices_enforce_immutability;
  alter table public.invoice_lines enable trigger invoice_lines_enforce_immutability;
  alter table public.invoice_delivery_notes enable trigger invoice_delivery_notes_enforce_integrity;

  -- El siguiente número vuelve a ser el de la factura borrada (solo si era el último).
  update public.document_sequences s
  set next_number = inv.number
  where s.company_id = tenant_id and s.document_type = 'invoice' and s.series = inv.series
    and s.next_number = inv.number + 1;

  insert into public.audit_events(company_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (tenant_id, actor_id, 'invoice', p_invoice_id::text, 'invoice.deleted_by_mistake', snapshot,
          jsonb_build_object('releasedNumber', inv.number, 'series', inv.series));

  return query select inv.series::text, inv.number::integer, exported_file;
end;
$function$;

alter function public.delete_mistaken_sales_invoice(uuid) owner to factupapa_migrator;
revoke all on function public.delete_mistaken_sales_invoice(uuid) from public;
grant execute on function public.delete_mistaken_sales_invoice(uuid) to factupapa_api;
