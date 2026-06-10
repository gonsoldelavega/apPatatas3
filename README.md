# apPatatas Operativa

PWA mobile-first para facturacion, stock, compras, gastos, albaranes y documentos, con sincronizacion en la nube entre dispositivos. Las compras entran por el flujo Drive -> agente (Google Apps Script) -> Google Sheets -> app. (La lectura de facturas por IA/OCR y el escaner se retiraron.)

## Estado actual

La base del proyecto ya queda preparada para:

- desplegar el frontal en Vercel
- usar `/api/app-state` como backend compartido de sincronizacion
- cargar las compras desde el registro de Google Sheets (`/api/purchase-registry`)
- conectar Google Drive desde el navegador con tu Google OAuth Client ID

> Nota: la lectura de facturas por IA (Anthropic) y el modulo de escaner se han retirado.
> Las compras entran ahora por el flujo Drive -> agente externo -> Google Sheets -> app.

## Despliegue recomendado

1. Sube esta carpeta a GitHub.
2. Importa el repositorio en Vercel.
3. En Vercel crea un Blob Store privado para el proyecto.
4. En Vercel configura las variables de entorno:
   - `APP_SYNC_TOKEN`
   - `BLOB_READ_WRITE_TOKEN`
   - (ya no se necesita `ANTHROPIC_API_KEY`: la lectura por IA se ha retirado)
5. Despliega.
6. En la app deja `Backend URL` como `/api/app-state`.

## Ajustes de la app

- `Google OAuth Client ID` ya viene precargado.
- `Backend URL` ahora debe ser `/api/app-state`.

## Archivos clave

- `index.html`: app principal
- `vercel.json`: configuracion de Vercel para SPA
- `api/app-state.js`: sincronizacion compartida para Vercel
- `api/purchase-registry.js`: lectura del registro de compras desde Google Sheets
- `src/app/bootstrap.js`: integracion principal de frontend
- `sw.js`: service worker

## Nota

La base del proyecto ya queda orientada a Vercel. Si aparecen carpetas locales antiguas de Netlify en tu equipo, son restos de pruebas anteriores y no forman parte del despliegue recomendado.
