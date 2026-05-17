# Drive Invoices Agent Plan

## Objetivo

Procesar facturas entrantes desde la carpeta Drive `1ETAzvmssbDM7cLDUEy89quY0xEnNecd4`, clasificarlas de forma segura y registrar compras/gastos en Supabase sin duplicados.

## Entradas

- Carpeta Drive de entrada: `1ETAzvmssbDM7cLDUEy89quY0xEnNecd4`.
- Ejecucion programada: 00:00 Europe/Madrid mediante n8n.
- Ejecucion manual: boton "Sincronizar facturas de Drive ahora" en Ajustes.

## Flujo seguro

1. Listar archivos candidatos en Drive.
2. Calcular identificadores: `drive_file_id` y hash opcional.
3. Consultar `processed_documents` antes de descargar/procesar.
4. Extraer texto/OCR.
5. Clasificar con reglas deterministas y/o IA.
6. Si `confidence < 0.80`, proveedor ausente, numero ausente o duplicado probable: marcar `pendiente_revision`.
7. Solo insertar compra/gasto definitivo si la confianza es suficiente y no hay duplicado.
8. Guardar `raw_text` y `ai_json` para auditoria.
9. Actualizar resumen mensual leyendo datos ya insertados.
10. Mover/clasificar archivo solo despues de registrar el resultado, y nunca en dry-run.

## Env vars necesarias

- `DRIVE_INVOICES_SYNC_TOKEN`: token para invocar `api/drive-invoices-sync`.
- `N8N_DRIVE_INVOICES_WEBHOOK_URL`: webhook n8n que ejecuta el workflow.
- `N8N_DRIVE_INVOICES_WEBHOOK_TOKEN`: bearer opcional para n8n.
- `DRIVE_INVOICES_FOLDER_ID`: opcional; por defecto usa `1ETAzvmssbDM7cLDUEy89quY0xEnNecd4`.

## Estado actual

- Endpoint de disparo manual creado.
- Boton de app creado.
- Procesamiento real pendiente de credenciales y workflow n8n activo.
- Sin movimientos reales de Drive.
