-- Permissions for the purchase export worker are additive so the original
-- outbox migration remains immutable after it has been applied in staging.
alter table purchase_invoice_export_events owner to factupapa_migrator;
grant select, insert, update on purchase_invoice_export_events to factupapa_api;
grant execute on function claim_purchase_invoice_export_events(integer) to factupapa_api;
