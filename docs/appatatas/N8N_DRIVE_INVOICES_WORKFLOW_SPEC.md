# N8N Drive Invoices Workflow Spec

## Trigger diario

- Cron: todos los dias a las 00:00 Europe/Madrid.
- Webhook manual: recibe payload desde `api/drive-invoices-sync.js`.

## Payload manual esperado

```json
{
  "mode": "manual",
  "source": "appatatas-settings",
  "folderId": "1ETAzvmssbDM7cLDUEy89quY0xEnNecd4",
  "dryRun": true,
  "requestedAt": "2026-05-17T00:00:00.000Z"
}
```

## Nodos propuestos

1. Webhook/Cron.
2. Google Drive: listar archivos de carpeta.
3. Supabase: consultar `processed_documents` por `drive_file_id`.
4. IF: saltar si ya existe definitivo.
5. Google Drive: descargar archivo.
6. OCR/AI extraction.
7. Function: normalizar JSON y calcular `confidence`.
8. Supabase: buscar proveedor por NIF/nombre.
9. Supabase: buscar duplicados por proveedor, numero, fecha y total.
10. IF seguridad:
   - `confidence < 0.80` -> `pendiente_revision`.
   - sin proveedor -> `pendiente_revision`.
   - sin numero factura -> `pendiente_revision`.
   - duplicado probable -> `duplicado`.
11. Supabase: insertar `facturas_compra` o `gastos` solo si es seguro.
12. Supabase: insertar/actualizar `processed_documents`.
13. Google Drive: mover archivo solo si `dryRun=false` y el registro ya existe.
14. Respuesta JSON con contadores.

## Respuesta recomendada

```json
{
  "ok": true,
  "dryRun": true,
  "listed": 12,
  "processed": 0,
  "pendingReview": 3,
  "duplicates": 1,
  "errors": 0
}
```
