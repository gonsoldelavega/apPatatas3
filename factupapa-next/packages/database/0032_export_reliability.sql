alter table purchase_invoice_export_events
  add column if not exists exported_without_document boolean not null default false;
