-- A draft may reserve the editable number shown by the invoice form.
-- Issued/cancelled lifecycle requirements and the unique number index remain.
alter table public.invoices drop constraint invoices_sales_lifecycle_check;
alter table public.invoices add constraint invoices_sales_lifecycle_check check (
  (status = 'draft' and (number is null or number > 0)
    and issued_at is null and cancelled_at is null)
  or
  (status = 'issued' and number is not null and issued_at is not null and cancelled_at is null)
  or
  (status = 'cancelled' and number is not null and issued_at is not null and cancelled_at is not null)
);

-- Preserve every existing reservation when upgrading an existing database.
insert into public.document_sequences(company_id, document_type, series, next_number)
select company_id, 'invoice', series, max(number) + 1
from public.invoices where number is not null
group by company_id, series
on conflict (company_id, document_type, series) do update
set next_number = greatest(document_sequences.next_number, excluded.next_number);
