-- Pizarra «por preparar»: una línea apuntada que aún no está hecha (made_at nulo) no suma a la nevera.
-- Al marcarla como hecha se suma a la nevera y pasa a esperar entrega. Las líneas que ya existían
-- estaban hechas desde que se crearon.
-- Migración aditiva: columna nueva sobre una tabla nueva (0047).

alter table fridge_lines add column made_at timestamptz;
update fridge_lines set made_at = created_at;
alter table fridge_lines add constraint fridge_lines_delivered_after_made
  check (delivered_at is null or made_at is not null);
create index fridge_lines_to_prepare_idx on fridge_lines (company_id, created_at) where made_at is null;
