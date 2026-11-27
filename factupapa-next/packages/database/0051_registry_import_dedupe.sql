-- Compras importadas del Registro Maestro: sin la copia de una compra que ya estaba apuntada a mano.
--
-- Da de baja (baja lógica, como el botón «eliminar» de la app; recuperable) la copia importada del registro de
-- una factura que ya estaba apuntada a mano y confirmada: mismo proveedor por NIF, misma fecha y mismo total,
-- sin número. Se conserva la manual porque es la que lleva los kilos del stock.
-- No borra datos: la baja conserva quién y por qué (delete_reason).

update purchase_invoices dup
   set deleted_at = now(),
       deleted_by_user_id = dup.created_by_user_id,
       delete_reason = 'Duplicada: la compra ya estaba apuntada a mano y confirmada (se conserva la manual)'
 where dup.deleted_at is null
   and dup.source_registry_key is not null
   and dup.source_registry_key not like 'legacy-purchase:%'
   and exists (
     select 1 from purchase_invoices manual
      where manual.company_id = dup.company_id
        and manual.id <> dup.id
        and manual.deleted_at is null
        and manual.status = 'confirmed'
        and manual.source_registry_key is null
        and coalesce(btrim(manual.supplier_invoice_number), '') = ''
        and manual.supplier_tax_identity_key = dup.supplier_tax_identity_key
        and manual.issue_date = dup.issue_date
        and abs(manual.total - dup.total) <= 0.05
   );
