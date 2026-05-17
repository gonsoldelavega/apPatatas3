# Night Run Log - 2026-05-17

## Fase 1 - Salud inicial

- `git status --short`: limpio al inicio tras registrar el repo como `safe.directory`.
- `git log -5 --oneline`: ultimo commit inicial `3067c7c Remove accidental status log file`.
- `node --check src/app/bootstrap.js`: OK.
- `node --check src/ui/forms/invoice-form.js`: OK.
- Observacion: Git bloqueaba el repo por propiedad dudosa. Se resolvio con `git config --global --add safe.directory C:/Users/nando/Documents/apPatatas`.
- Archivos llamativos existentes antes de cambios: `_tmp_invoiceapp.zip` y logs `netlify-dev*.log`. No se borraron por seguridad.

## Fase 2 - Facturas

- Detectado que `deliveryDate` ya existia en el editor de lineas, pero podia quedar vacio y solo se imprimia con plantilla `quincenal`.
- Se normalizan lineas antiguas con fallback: `deliveryDate`, `fechaEntrega`, `delivery_date`, `date`, `issueDate` o fecha actual.
- La factura impresa/preview/PDF muestra:
  - fecha de emision;
  - periodo si existe;
  - fecha de entrega general si todas las lineas comparten fecha;
  - fecha de entrega por linea si hay varias entregas.
- Se reforzaron validaciones antes de guardar factura.

## Fase 3-4 - Drive y anti-duplicados

- Se preparo endpoint seguro `api/drive-invoices-sync.js`.
- El endpoint no procesa Drive directamente: llama a webhook n8n configurado por env var y usa `dryRun` por defecto.
- Se preparo documentacion y SQL propuesto para `processed_documents`.
- No se movieron archivos reales de Drive.
- No se ejecuto SQL contra produccion.
