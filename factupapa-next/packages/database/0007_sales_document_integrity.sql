alter table invoice_delivery_notes
  add column released_at timestamptz;

update invoice_delivery_notes as link
set released_at = coalesce(invoice.cancelled_at, now())
from invoices as invoice
where invoice.company_id = link.company_id
  and invoice.id = link.invoice_id
  and invoice.status = 'cancelled';

update delivery_notes as note
set status = 'issued'
from invoice_delivery_notes as link
join invoices as invoice
  on invoice.company_id = link.company_id
 and invoice.id = link.invoice_id
where note.company_id = link.company_id
  and note.id = link.delivery_note_id
  and invoice.status = 'cancelled'
  and note.status = 'invoiced';

alter table invoice_delivery_notes
  drop constraint invoice_delivery_notes_company_id_delivery_note_id_key;

create unique index invoice_delivery_notes_active_note_key
  on invoice_delivery_notes(company_id, delivery_note_id)
  where released_at is null;

create index invoice_delivery_notes_active_invoice_idx
  on invoice_delivery_notes(company_id, invoice_id)
  where released_at is null;

create function enforce_sales_document_immutability()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A non-draft sales document is immutable'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if old.status = 'draft' then
    return new;
  end if;

  if tg_table_name = 'invoices' then
    if old.status = 'issued'
       and new.status = 'cancelled'
       and new.cancelled_at is not null
       and (to_jsonb(new) - array['status', 'cancelled_at', 'updated_at'])
           = (to_jsonb(old) - array['status', 'cancelled_at', 'updated_at']) then
      return new;
    end if;
  elsif tg_table_name = 'delivery_notes' then
    if old.status = 'issued'
       and new.status = 'invoiced'
       and (to_jsonb(new) - array['status', 'updated_at'])
           = (to_jsonb(old) - array['status', 'updated_at']) then
      return new;
    end if;
    if old.status = 'invoiced'
       and new.status = 'issued'
       and (to_jsonb(new) - array['status', 'updated_at'])
           = (to_jsonb(old) - array['status', 'updated_at']) then
      return new;
    end if;
    if old.status = 'issued'
       and new.status = 'cancelled'
       and new.cancelled_at is not null
       and (to_jsonb(new) - array['status', 'cancelled_at', 'updated_at'])
           = (to_jsonb(old) - array['status', 'cancelled_at', 'updated_at']) then
      return new;
    end if;
  end if;

  raise exception 'A non-draft sales document is immutable'
    using errcode = '55000';
end
$function$;

create function enforce_sales_document_line_immutability()
returns trigger
language plpgsql
as $function$
declare
  parent_status text;
  parent_id uuid;
begin
  if tg_table_name = 'invoice_lines' then
    parent_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
    select status::text into parent_status
    from invoices
    where id = parent_id;
  elsif tg_table_name = 'delivery_note_lines' then
    parent_id := case when tg_op = 'DELETE' then old.delivery_note_id else new.delivery_note_id end;
    select status::text into parent_status
    from delivery_notes
    where id = parent_id;
  end if;

  if parent_status is distinct from 'draft' then
    raise exception 'Lines of a non-draft sales document are immutable'
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create trigger invoices_enforce_immutability
before update or delete on invoices
for each row execute function enforce_sales_document_immutability();

create trigger delivery_notes_enforce_immutability
before update or delete on delivery_notes
for each row execute function enforce_sales_document_immutability();

create trigger invoice_lines_enforce_immutability
before insert or update or delete on invoice_lines
for each row execute function enforce_sales_document_line_immutability();

create trigger delivery_note_lines_enforce_immutability
before insert or update or delete on delivery_note_lines
for each row execute function enforce_sales_document_line_immutability();

alter function enforce_sales_document_immutability() owner to factupapa_migrator;
alter function enforce_sales_document_line_immutability() owner to factupapa_migrator;
