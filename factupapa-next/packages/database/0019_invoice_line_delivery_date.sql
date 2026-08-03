alter table public.invoice_lines
  add column if not exists delivery_date date;

comment on column public.invoice_lines.delivery_date is
  'Fecha real de entrega del producto facturado, cuando difiere por línea.';
