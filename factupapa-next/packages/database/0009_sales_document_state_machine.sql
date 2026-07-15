-- Enforce the sales-document state machine after the import-retention schema.
insert into public.document_sequences(company_id, document_type, series, next_number)
select invoice.company_id, 'invoice', invoice.series, max(invoice.number) + 1
from public.invoices as invoice
where invoice.status <> 'draft'
  and invoice.number is not null
group by invoice.company_id, invoice.series
on conflict(company_id, document_type, series) do update
set next_number = greatest(document_sequences.next_number, excluded.next_number);

alter table public.invoices disable trigger invoices_enforce_immutability;

update public.invoices
set number = null,
    issued_at = null,
    cancelled_at = null
where status = 'draft';

update public.invoices
set issued_at = coalesce(issued_at, created_at),
    cancelled_at = null
where status = 'issued';

update public.invoices
set issued_at = coalesce(issued_at, created_at),
    cancelled_at = coalesce(cancelled_at, updated_at, created_at)
where status = 'cancelled';

alter table public.invoices
  add constraint invoices_sales_lifecycle_check
  check (
    (status = 'draft' and number is null and issued_at is null and cancelled_at is null)
    or
    (status = 'issued' and number is not null and issued_at is not null and cancelled_at is null)
    or
    (status = 'cancelled' and number is not null and issued_at is not null and cancelled_at is not null)
  );

alter table public.invoices enable trigger invoices_enforce_immutability;

create or replace function public.enforce_sales_document_immutability()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A non-draft sales document is immutable'
        using errcode = '55000';
    end if;
    return old;
  end if;

  if tg_table_name = 'invoices' then
    if old.status = 'draft' and new.status = 'draft' then
      return new;
    end if;

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
       and new.status = 'cancelled'
       and current_user = 'factupapa_migrator'
       and new.cancelled_at is not null
       and not exists (
         select 1
         from public.invoice_delivery_notes as link
         where link.company_id = old.company_id
           and link.invoice_id = old.id
           and link.released_at is null
       )
       and (to_jsonb(new) - array['status', 'cancelled_at', 'updated_at'])
           = (to_jsonb(old) - array['status', 'cancelled_at', 'updated_at']) then
      return new;
    end if;
  elsif tg_table_name = 'delivery_notes' then
    if old.status = 'draft' and new.status = 'draft' then
      return new;
    end if;

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
       and new.status = 'invoiced'
       and exists (
         select 1
         from public.invoice_delivery_notes as link
         where link.company_id = old.company_id
           and link.delivery_note_id = old.id
           and link.released_at is null
       )
       and (to_jsonb(new) - array['status', 'updated_at'])
           = (to_jsonb(old) - array['status', 'updated_at']) then
      return new;
    end if;

    if old.status = 'invoiced'
       and new.status = 'issued'
       and current_user = 'factupapa_migrator'
       and not exists (
         select 1
         from public.invoice_delivery_notes as link
         where link.company_id = old.company_id
           and link.delivery_note_id = old.id
           and link.released_at is null
       )
       and (to_jsonb(new) - array['status', 'updated_at'])
           = (to_jsonb(old) - array['status', 'updated_at']) then
      return new;
    end if;

    if old.status = 'issued'
       and new.status = 'cancelled'
       and new.cancelled_at is not null
       and not exists (
         select 1
         from public.invoice_delivery_notes as link
         where link.company_id = old.company_id
           and link.delivery_note_id = old.id
           and link.released_at is null
       )
       and (to_jsonb(new) - array['status', 'cancelled_at', 'updated_at'])
           = (to_jsonb(old) - array['status', 'cancelled_at', 'updated_at']) then
      return new;
    end if;
  end if;

  raise exception 'Invalid or immutable sales document transition'
    using errcode = '55000';
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
begin
  if tg_table_name = 'invoice_lines' then
    if tg_op in ('UPDATE', 'DELETE') then
      select invoice.status::text into old_parent_status
      from public.invoices as invoice
      where invoice.company_id = old.company_id
        and invoice.id = old.invoice_id;
    end if;

    if tg_op in ('INSERT', 'UPDATE') then
      select invoice.status::text into new_parent_status
      from public.invoices as invoice
      where invoice.company_id = new.company_id
        and invoice.id = new.invoice_id;
    end if;
  elsif tg_table_name = 'delivery_note_lines' then
    if tg_op in ('UPDATE', 'DELETE') then
      select note.status::text into old_parent_status
      from public.delivery_notes as note
      where note.company_id = old.company_id
        and note.id = old.delivery_note_id;
    end if;

    if tg_op in ('INSERT', 'UPDATE') then
      select note.status::text into new_parent_status
      from public.delivery_notes as note
      where note.company_id = new.company_id
        and note.id = new.delivery_note_id;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and old_parent_status is distinct from 'draft' then
    raise exception 'Lines of a non-draft sales document are immutable'
      using errcode = '55000';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and new_parent_status is distinct from 'draft' then
    raise exception 'Lines may only belong to a draft sales document'
      using errcode = '55000';
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'invoice_lines' then
      if (new.invoice_id <> old.invoice_id or new.company_id <> old.company_id)
         and old_parent_status <> 'draft' then
        raise exception 'An invoice line cannot be moved from a non-draft document'
          using errcode = '55000';
      end if;
    elsif tg_table_name = 'delivery_note_lines' then
      if (new.delivery_note_id <> old.delivery_note_id or new.company_id <> old.company_id)
         and old_parent_status <> 'draft' then
        raise exception 'A delivery note line cannot be moved from a non-draft document'
          using errcode = '55000';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

create function public.enforce_invoice_delivery_note_integrity()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  invoice_status text;
  invoice_source text;
  note_status text;
begin
  if tg_op = 'INSERT' then
    if new.released_at is not null then
      raise exception 'A new delivery note link must be active'
        using errcode = '55000';
    end if;

    select invoice.status::text, invoice.source_type::text
      into invoice_status, invoice_source
    from public.invoices as invoice
    where invoice.company_id = new.company_id
      and invoice.id = new.invoice_id;

    select note.status::text into note_status
    from public.delivery_notes as note
    where note.company_id = new.company_id
      and note.id = new.delivery_note_id;

    if invoice_status is distinct from 'draft'
       or invoice_source is distinct from 'delivery_notes'
       or note_status is distinct from 'issued' then
      raise exception 'The delivery note link is not relationally valid'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if current_user <> 'factupapa_migrator' then
    raise exception 'Delivery note links cannot be mutated directly'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if old.released_at is not null
       or new.released_at is null
       or (to_jsonb(new) - 'released_at') <> (to_jsonb(old) - 'released_at') then
      raise exception 'A delivery note link can only be released once'
        using errcode = '55000';
    end if;

    select invoice.status::text, invoice.source_type::text
      into invoice_status, invoice_source
    from public.invoices as invoice
    where invoice.company_id = old.company_id
      and invoice.id = old.invoice_id;

    select note.status::text into note_status
    from public.delivery_notes as note
    where note.company_id = old.company_id
      and note.id = old.delivery_note_id;

    if invoice_status is distinct from 'issued'
       or invoice_source is distinct from 'delivery_notes'
       or note_status is distinct from 'invoiced' then
      raise exception 'The delivery note link cannot be released in its current state'
        using errcode = '55000';
    end if;
    return new;
  end if;

  return old;
end
$function$;

create trigger invoice_delivery_notes_enforce_integrity
before insert or update or delete on public.invoice_delivery_notes
for each row execute function public.enforce_invoice_delivery_note_integrity();

create function public.cancel_sales_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  tenant_id uuid;
  actor_id uuid;
  invoice_before public.invoices%rowtype;
  invoice_after public.invoices%rowtype;
  linked_note record;
  cancellation_time timestamptz := clock_timestamp();
  released_count integer := 0;
begin
  tenant_id := nullif(current_setting('app.current_company_id', true), '')::uuid;
  actor_id := nullif(current_setting('app.current_user_id', true), '')::uuid;

  if tenant_id is null or actor_id is null or not exists (
    select 1
    from public.memberships as membership
    join public.users as user_account on user_account.id = membership.user_id
    where membership.company_id = tenant_id
      and membership.user_id = actor_id
      and user_account.is_active
  ) then
    raise exception 'A valid tenant identity is required'
      using errcode = '42501';
  end if;

  select invoice.* into invoice_before
  from public.invoices as invoice
  where invoice.company_id = tenant_id
    and invoice.id = p_invoice_id
  for update;

  if not found or invoice_before.status <> 'issued' then
    raise exception 'Only an issued invoice can be cancelled'
      using errcode = '55000';
  end if;

  if invoice_before.source_type = 'delivery_notes' then
    if exists (
      select 1
      from public.invoice_delivery_notes as link
      where link.company_id = tenant_id
        and link.invoice_id = p_invoice_id
        and link.released_at is not null
    ) then
      raise exception 'An issued invoice cannot contain released delivery note links'
        using errcode = '55000';
    end if;

    for linked_note in
      select link.id as link_id, note.id as note_id, note.status::text as note_status
      from public.invoice_delivery_notes as link
      join public.delivery_notes as note
        on note.company_id = link.company_id
       and note.id = link.delivery_note_id
      where link.company_id = tenant_id
        and link.invoice_id = p_invoice_id
        and link.released_at is null
      order by note.id
      for update of link, note
    loop
      if linked_note.note_status <> 'invoiced' then
        raise exception 'Every linked delivery note must be invoiced'
          using errcode = '55000';
      end if;

      update public.invoice_delivery_notes as link
      set released_at = cancellation_time
      where link.id = linked_note.link_id
        and link.released_at is null;
      if not found then
        raise exception 'The delivery note link was already released'
          using errcode = '55000';
      end if;

      update public.delivery_notes as note
      set status = 'issued'
      where note.company_id = tenant_id
        and note.id = linked_note.note_id
        and note.status = 'invoiced';
      if not found then
        raise exception 'The delivery note could not be reopened'
          using errcode = '55000';
      end if;

      insert into public.audit_events(
        company_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
      ) values (
        tenant_id,
        actor_id,
        'delivery_note',
        linked_note.note_id::text,
        'delivery_note.reopened_after_invoice_cancellation',
        jsonb_build_object('status', 'invoiced', 'invoiceId', p_invoice_id),
        jsonb_build_object('status', 'issued', 'releasedAt', cancellation_time)
      );
      released_count := released_count + 1;
    end loop;

    if released_count = 0 then
      raise exception 'A delivery-note invoice must have active links'
        using errcode = '55000';
    end if;
  elsif exists (
    select 1
    from public.invoice_delivery_notes as link
    where link.company_id = tenant_id
      and link.invoice_id = p_invoice_id
      and link.released_at is null
  ) then
    raise exception 'A manual invoice cannot have active delivery note links'
      using errcode = '55000';
  end if;

  update public.invoices as invoice
  set status = 'cancelled',
      cancelled_at = cancellation_time
  where invoice.company_id = tenant_id
    and invoice.id = p_invoice_id
    and invoice.status = 'issued'
  returning invoice.* into invoice_after;

  if not found then
    raise exception 'The invoice could not be cancelled'
      using errcode = '55000';
  end if;

  insert into public.audit_events(
    company_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    tenant_id,
    actor_id,
    'invoice',
    p_invoice_id::text,
    'invoice.cancelled',
    to_jsonb(invoice_before),
    to_jsonb(invoice_after)
  );
end
$function$;

alter function public.enforce_sales_document_immutability() owner to factupapa_migrator;
alter function public.enforce_sales_document_line_immutability() owner to factupapa_migrator;
alter function public.enforce_invoice_delivery_note_integrity() owner to factupapa_migrator;
alter function public.cancel_sales_invoice(uuid) owner to factupapa_migrator;

revoke all on function public.enforce_sales_document_immutability() from public;
revoke all on function public.enforce_sales_document_line_immutability() from public;
revoke all on function public.enforce_invoice_delivery_note_integrity() from public;
revoke all on function public.cancel_sales_invoice(uuid) from public;

revoke update, delete on public.invoice_delivery_notes from factupapa_api;
grant execute on function public.cancel_sales_invoice(uuid) to factupapa_api;
