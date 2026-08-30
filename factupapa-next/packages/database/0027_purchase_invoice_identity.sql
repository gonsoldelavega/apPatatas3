alter table purchase_invoices
  add column if not exists supplier_invoice_number_key text,
  add column if not exists supplier_tax_identity_key text;

drop index if exists purchase_invoices_supplier_number_unique_idx;
create unique index if not exists purchase_invoices_invoice_identity_idx
  on purchase_invoices(company_id, supplier_tax_identity_key, issue_date, supplier_invoice_number_key)
  where supplier_invoice_number_key is not null
    and supplier_tax_identity_key is not null
    and status <> 'cancelled'
    and deleted_at is null;
