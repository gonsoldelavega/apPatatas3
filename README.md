# apPatatas Operativa

PWA mobile-first para facturacion, stock, compras, gastos, albaranes, documentos, OCR con IA y sincronizacion ligera en nube.

## Estado actual

La base del proyecto ya queda preparada para:

- desplegar el frontal en Vercel
- usar `/api/anthropic-ocr` para mejorar OCR con Anthropic
- usar `/api/app-state` como backend compartido de sincronizacion
- conectar Google Drive desde el navegador con tu Google OAuth Client ID

## Despliegue recomendado

1. Sube esta carpeta a GitHub.
2. Importa el repositorio en Vercel.
3. En Vercel crea un Blob Store privado para el proyecto.
4. En Vercel configura las variables de entorno:
   - `APP_SYNC_TOKEN`
   - `BLOB_READ_WRITE_TOKEN`
   - `ANTHROPIC_API_KEY` opcional si quieres OCR IA por servidor
5. Despliega.
6. En la app deja `Backend URL` como `/api/app-state`.

## Ajustes de la app

- `Google OAuth Client ID` ya viene precargado.
- `Backend URL` ahora debe ser `/api/app-state`.
- Si quieres OCR mejorado desde la propia app, puedes pegar tambien tu `API Key Anthropic` en Ajustes.

## Archivos clave

- [index.html](C:\Users\nando\Documents\apPatatas\index.html): app principal
- [vercel.json](C:\Users\nando\Documents\apPatatas\vercel.json): configuracion de Vercel para SPA
- [api/app-state.js](C:\Users\nando\Documents\apPatatas\api\app-state.js): sincronizacion compartida para Vercel
- [api/anthropic-ocr.js](C:\Users\nando\Documents\apPatatas\api\anthropic-ocr.js): OCR mejorado con Anthropic
- [src/app/bootstrap.js](C:\Users\nando\Documents\apPatatas\src\app\bootstrap.js): integracion principal de frontend
- [sw.js](C:\Users\nando\Documents\apPatatas\sw.js): service worker

## Nota

La base del proyecto ya queda orientada a Vercel. Si aparecen carpetas locales antiguas de Netlify en tu equipo, son restos de pruebas anteriores y no forman parte del despliegue recomendado.
