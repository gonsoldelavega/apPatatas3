-- Prevent a document from becoming a purchase unless the document classifier
-- has explicitly established that it is an eligible supplier invoice.
-- Manual purchases without a source document remain valid.

create or replace function public.enforce_purchase_document_classification()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  document_row record;
  document_type text;
  eligible boolean;
  classification_confidence numeric;
begin
  if new.document_id is null then
    return new;
  end if;

  select d.kind, d.status, d.extracted_data
  into document_row
  from public.documents d
  where d.company_id = new.company_id and d.id = new.document_id;

  if not found then
    raise exception 'Purchase source document does not exist in this company'
      using errcode = '23503';
  end if;

  document_type := coalesce(document_row.extracted_data->>'documentType', 'unknown');
  eligible := coalesce((document_row.extracted_data->>'purchaseEligible')::boolean, false);
  classification_confidence := case
    when coalesce(document_row.extracted_data->>'classificationConfidence', '') ~ '^([01](\.[0-9]+)?)$'
      then (document_row.extracted_data->>'classificationConfidence')::numeric
    else 0
  end;

  if document_type <> 'supplier_invoice'
     or eligible is not true
     or classification_confidence < 0.80 then
    raise exception 'Source document is not an eligible supplier invoice'
      using errcode = '23514',
            detail = format(
              'documentType=%s purchaseEligible=%s confidence=%s',
              document_type,
              eligible,
              classification_confidence
            );
  end if;

  return new;
end
$function$;

alter function public.enforce_purchase_document_classification() owner to factupapa_migrator;
revoke all on function public.enforce_purchase_document_classification() from public;
grant execute on function public.enforce_purchase_document_classification() to factupapa_api;

drop trigger if exists purchase_invoices_document_classification_guard on public.purchase_invoices;
create trigger purchase_invoices_document_classification_guard
before insert or update of document_id on public.purchase_invoices
for each row execute function public.enforce_purchase_document_classification();
