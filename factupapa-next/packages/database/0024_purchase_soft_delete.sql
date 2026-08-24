alter table purchase_invoices
  add column deleted_at timestamptz,
  add column deleted_by_user_id uuid,
  add column delete_reason text;

alter table purchase_invoices
  add constraint purchase_invoices_deleted_by_fk
  foreign key (company_id, deleted_by_user_id)
  references memberships(company_id, user_id);

alter table purchase_invoices
  add constraint purchase_invoices_delete_metadata_check
  check (
    (deleted_at is null and deleted_by_user_id is null and delete_reason is null)
    or
    (deleted_at is not null and deleted_by_user_id is not null and char_length(btrim(delete_reason)) between 1 and 500)
  );

create index purchase_invoices_active_list_idx
  on purchase_invoices(company_id, issue_date desc, id desc)
  where deleted_at is null;

drop index purchase_invoices_supplier_number_unique_idx;
create unique index purchase_invoices_supplier_number_unique_idx
  on purchase_invoices(company_id, supplier_id, lower(btrim(supplier_invoice_number)))
  where supplier_id is not null
    and supplier_invoice_number is not null
    and btrim(supplier_invoice_number) <> ''
    and status <> 'cancelled'
    and deleted_at is null;

create or replace function enforce_purchase_invoice_state() returns trigger
language plpgsql set search_path = pg_catalog, public as $function$
declare calculated record;
begin
  if new.company_id is distinct from old.company_id then
    raise exception 'company_id is immutable' using errcode = '55000';
  end if;

  if old.deleted_at is not null then
    raise exception 'Deleted purchases are immutable' using errcode = '55000';
  end if;

  if new.deleted_at is not null then
    if new.deleted_by_user_id is null or new.delete_reason is null or btrim(new.delete_reason) = '' then
      raise exception 'Deleted purchase requires actor and reason' using errcode = '23514';
    end if;
    if (to_jsonb(new)-array['deleted_at','deleted_by_user_id','delete_reason','updated_at']) <>
       (to_jsonb(old)-array['deleted_at','deleted_by_user_id','delete_reason','updated_at']) then
      raise exception 'Purchase data cannot change during deletion' using errcode = '55000';
    end if;
    return new;
  end if;

  if old.status <> 'draft' then
    raise exception 'Confirmed or cancelled purchases are immutable' using errcode = '55000';
  end if;
  if new.status = 'draft' then return new; end if;
  if new.status = 'confirmed' then
    if new.supplier_id is null or new.supplier_invoice_number is null or btrim(new.supplier_invoice_number) = '' or new.confirmed_at is null or new.cancelled_at is not null then
      raise exception 'A confirmed purchase requires supplier, number and confirmation timestamp' using errcode = '23514';
    end if;
    select count(*) count,coalesce(sum(line_subtotal),0) subtotal,coalesce(sum(line_tax),0) tax_total,coalesce(sum(line_total),0) total
      into calculated from purchase_invoice_lines where company_id=old.company_id and purchase_invoice_id=old.id;
    if calculated.count=0 or new.subtotal<>calculated.subtotal or new.tax_total<>calculated.tax_total or new.total<>calculated.total then
      raise exception 'Purchase totals do not match its lines' using errcode = '23514';
    end if;
    if (to_jsonb(new)-array['status','confirmed_at','updated_at'])<>(to_jsonb(old)-array['status','confirmed_at','updated_at']) then
      raise exception 'Purchase data cannot change during confirmation' using errcode = '55000';
    end if;
    return new;
  end if;
  if new.status = 'cancelled' and new.cancelled_at is not null and new.confirmed_at is null and
     (to_jsonb(new)-array['status','cancelled_at','updated_at'])=(to_jsonb(old)-array['status','cancelled_at','updated_at']) then
    return new;
  end if;
  raise exception 'Invalid purchase transition' using errcode = '55000';
end $function$;

alter function enforce_purchase_invoice_state() owner to factupapa_migrator;
