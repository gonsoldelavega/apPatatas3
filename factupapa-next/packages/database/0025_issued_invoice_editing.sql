-- Keep issued invoices open for fortnightly order accumulation while preserving
-- their fiscal identity and the immutability of cancelled documents/albaranes.
create or replace function public.enforce_sales_document_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A non-draft sales document is immutable' using errcode = '55000';
    end if;
    return old;
  end if;

  if tg_table_name = 'invoices' then
    if old.status = 'draft' and new.status = 'draft' then return new; end if;

    if old.status = 'draft'
       and new.status = 'issued'
       and new.number is not null
       and new.issued_at is not null
       and new.cancelled_at is null
       and (to_jsonb(new) - array['number', 'status', 'issued_at', 'updated_at'])
           = (to_jsonb(old) - array['number', 'status', 'issued_at', 'updated_at']) then
      return new;
    end if;

    if old.status = 'issued'
       and new.status = 'issued'
       and (to_jsonb(new) - array[
         'contact_id', 'contact_legal_name', 'contact_tax_id', 'contact_address',
         'series', 'issue_date', 'due_date', 'notes', 'operation_start_date',
         'operation_end_date', 'delivery_dates', 'payment_terms',
         'general_information', 'subtotal', 'tax_total', 'total', 'updated_at'
       ]) = (to_jsonb(old) - array[
         'contact_id', 'contact_legal_name', 'contact_tax_id', 'contact_address',
         'series', 'issue_date', 'due_date', 'notes', 'operation_start_date',
         'operation_end_date', 'delivery_dates', 'payment_terms',
         'general_information', 'subtotal', 'tax_total', 'total', 'updated_at'
       ]) then
      return new;
    end if;

    if old.status = 'issued'
       and new.status = 'cancelled'
       and current_user = 'factupapa_migrator'
       and new.cancelled_at is not null
       and not exists (
         select 1 from public.invoice_delivery_notes as link
         where link.company_id = old.company_id and link.invoice_id = old.id
           and link.released_at is null
       )
       and (to_jsonb(new) - array['status', 'cancelled_at', 'updated_at'])
           = (to_jsonb(old) - array['status', 'cancelled_at', 'updated_at']) then
      return new;
    end if;
  elsif tg_table_name = 'delivery_notes' then
    if old.status = 'draft' and new.status = 'draft' then return new; end if;
    if old.status = 'draft' and new.status = 'issued'
       and new.number is not null and new.issued_at is not null and new.cancelled_at is null
       and (to_jsonb(new) - array['number', 'status', 'issued_at', 'updated_at'])
           = (to_jsonb(old) - array['number', 'status', 'issued_at', 'updated_at']) then return new; end if;
    if old.status = 'issued' and new.status = 'invoiced'
       and exists (select 1 from public.invoice_delivery_notes as link where link.company_id=old.company_id and link.delivery_note_id=old.id and link.released_at is null)
       and (to_jsonb(new)-array['status','updated_at'])=(to_jsonb(old)-array['status','updated_at']) then return new; end if;
    if old.status = 'invoiced' and new.status = 'issued' and current_user='factupapa_migrator'
       and not exists (select 1 from public.invoice_delivery_notes as link where link.company_id=old.company_id and link.delivery_note_id=old.id and link.released_at is null)
       and (to_jsonb(new)-array['status','updated_at'])=(to_jsonb(old)-array['status','updated_at']) then return new; end if;
    if old.status = 'issued' and new.status = 'cancelled' and new.cancelled_at is not null
       and not exists (select 1 from public.invoice_delivery_notes as link where link.company_id=old.company_id and link.delivery_note_id=old.id and link.released_at is null)
       and (to_jsonb(new)-array['status','cancelled_at','updated_at'])=(to_jsonb(old)-array['status','cancelled_at','updated_at']) then return new; end if;
  end if;

  raise exception 'Invalid or immutable sales document transition' using errcode = '55000';
end
$function$;

create or replace function public.enforce_sales_document_line_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  old_parent_status text;
  new_parent_status text;
  allowed_statuses text[];
begin
  if tg_table_name = 'invoice_lines' then
    allowed_statuses := array['draft', 'issued'];
    if tg_op in ('UPDATE', 'DELETE') then
      select status::text into old_parent_status from public.invoices
      where company_id=old.company_id and id=old.invoice_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      select status::text into new_parent_status from public.invoices
      where company_id=new.company_id and id=new.invoice_id;
    end if;
    if tg_op = 'UPDATE'
       and (new.invoice_id is distinct from old.invoice_id or new.company_id is distinct from old.company_id) then
      raise exception 'An invoice line cannot be moved between documents' using errcode = '55000';
    end if;
  else
    allowed_statuses := array['draft'];
    if tg_op in ('UPDATE', 'DELETE') then
      select status::text into old_parent_status from public.delivery_notes
      where company_id=old.company_id and id=old.delivery_note_id;
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      select status::text into new_parent_status from public.delivery_notes
      where company_id=new.company_id and id=new.delivery_note_id;
    end if;
    if tg_op = 'UPDATE'
       and (new.delivery_note_id is distinct from old.delivery_note_id or new.company_id is distinct from old.company_id) then
      raise exception 'A delivery note line cannot be moved between documents' using errcode = '55000';
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and not (old_parent_status = any(allowed_statuses)) then
    raise exception 'Lines of this sales document are immutable' using errcode = '55000';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and not (new_parent_status = any(allowed_statuses)) then
    raise exception 'The sales document does not accept line changes' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

alter function public.enforce_sales_document_immutability() owner to factupapa_migrator;
alter function public.enforce_sales_document_line_immutability() owner to factupapa_migrator;
revoke all on function public.enforce_sales_document_immutability() from public;
revoke all on function public.enforce_sales_document_line_immutability() from public;
