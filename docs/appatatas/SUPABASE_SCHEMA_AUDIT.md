# Supabase Schema Audit

## Tablas observadas desde la app

- `clientes`
- `proveedores`
- `productos`
- `facturas_venta`
- `facturas_compra`
- `gastos`
- `monedero`
- `app_settings`
- `app_aux_state`

## Observaciones

- Las lineas de facturas y compras se serializan como JSON en `lines`.
- `deliveryDate` de facturas queda preservado dentro de `lines`, por lo que no requiere migracion inmediata.
- El contador oficial vive en `app_settings.id = global` con `next_invoice_number`.
- La app usa anon key publica desde `/api/public-config`; no debe exponerse ninguna service role key en frontend.

## Propuesta nueva

- Crear `processed_documents` para auditoria del agente Drive y anti-duplicados.
- No ejecutar la SQL directamente contra produccion sin revisar RLS y backup.
