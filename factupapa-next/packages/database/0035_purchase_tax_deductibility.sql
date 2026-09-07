alter table purchase_invoice_lines
  add column if not exists deductible_rate numeric(5,2) not null default 0
  check (deductible_rate >= 0 and deductible_rate <= 100);

comment on column purchase_invoice_lines.deductible_rate is
  'Porcentaje de IVA deducible clasificado explícitamente para previsiones fiscales';
