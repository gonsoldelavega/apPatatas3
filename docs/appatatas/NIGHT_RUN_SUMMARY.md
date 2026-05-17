# Night Run Summary - 2026-05-17

## Cambios realizados

- Facturas:
  - `deliveryDate` por linea normalizado con fallback compatible para facturas antiguas.
  - Formulario de factura muestra y guarda fecha de entrega por linea.
  - Preview/impresion/PDF muestran fecha de emision, periodo y fecha de entrega general o por linea.
  - Validaciones reforzadas: cliente, numero, fecha de emision, periodo, entrega, cantidad, precio, IVA y total.

- Ajustes:
  - Nueva seccion "Estado de la app" con version, commit si existe, sync, Supabase, Drive, service worker, PWA y siguiente factura.
  - Boton "Reparar sincronizacion local" que hidrata desde Supabase sin borrar datos locales si falla.
  - Boton "Sincronizar facturas de Drive ahora" conectado a endpoint seguro.
  - Bandeja minima documental para pendientes, duplicados, errores y procesadas.

- PWA:
  - `sw.js` versionado.
  - No cachea `/api/*`.
  - No cachea Supabase.
  - Limpia caches antiguos y solo cachea respuestas OK.

- Drive agent:
  - Endpoint `api/drive-invoices-sync.js` creado.
  - Requiere token por cabecera.
  - Llama a `N8N_DRIVE_INVOICES_WEBHOOK_URL`.
  - Si falta env var, devuelve error controlado.
  - Usa `dryRun: true` por defecto.

- Documentacion:
  - `NIGHT_RUN_LOG.md`
  - `DRIVE_INVOICES_AGENT_PLAN.md`
  - `N8N_DRIVE_INVOICES_WORKFLOW_SPEC.md`
  - `SUPABASE_SCHEMA_AUDIT.md`
  - `PROCESSED_DOCUMENTS_SQL_PROPOSAL.sql`
  - `APP_SYNC_BUTTON_PROPOSAL.md`
  - `SUPABASE_SECURITY_AUDIT.md`
  - `PWA_SERVICE_WORKER_NOTES.md`

## Comprobaciones

- `node --check src/app/bootstrap.js`: OK.
- `node --check src/ui/forms/invoice-form.js`: OK.
- `node --check src/ui/components/line-editor.js`: OK.
- `node --check src/ui/views/settings-view.js`: OK.
- `node --check api/drive-invoices-sync.js`: OK.
- `node --check sw.js`: OK.
- `git diff --check`: OK.
- Produccion `https://ap-patatas3.vercel.app`: responde HTML.
- Supabase `app_settings.global`: `FAC-100/2026` confirmado por lectura segura.

## Commits

- `af82c98 Improve invoice delivery dates and validation`
- `b9af213 Add app health and Drive sync foundation`

## Push y despliegue

- Push a `main`: completado.
- Vercel desplegado: confirmado. Produccion responde `200` y `sw.js` ya sirve `CACHE_VERSION = "2026-05-17-night-run"`.

## Pendiente para activar el agente Drive real

1. Configurar en Vercel:
   - `DRIVE_INVOICES_SYNC_TOKEN`
   - `N8N_DRIVE_INVOICES_WEBHOOK_URL`
   - `N8N_DRIVE_INVOICES_WEBHOOK_TOKEN` si n8n exige bearer
   - `DRIVE_INVOICES_FOLDER_ID` opcional
2. Crear tabla `processed_documents` revisando `PROCESSED_DOCUMENTS_SQL_PROPOSAL.sql`.
3. Implementar/importar workflow n8n segun `N8N_DRIVE_INVOICES_WORKFLOW_SPEC.md`.
4. Ejecutar primero en dry-run.
5. Revisar duplicados y pendientes.
6. Solo despues activar movimiento real de archivos Drive.
