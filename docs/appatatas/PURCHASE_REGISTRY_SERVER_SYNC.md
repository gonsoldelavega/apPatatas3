# Purchase Registry Server Sync

## Objetivo

La app movil no debe abrir OAuth de Google para sincronizar compras. Primero debe leer el registro maestro desde Vercel:

`GET /api/purchase-registry`

## Variables de entorno en Vercel

Anadir estas variables en el proyecto de Vercel:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `PURCHASE_REGISTRY_SPREADSHEET_ID`
- `PURCHASE_REGISTRY_SHEET_NAME`

Valores esperados:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: email de la service account, por ejemplo `appatatas-sheets@...iam.gserviceaccount.com`.
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: clave privada completa. Puede pegarse con saltos reales o con `\n`; el endpoint normaliza ambos formatos.
- `PURCHASE_REGISTRY_SPREADSHEET_ID`: ID de la hoja del registro maestro.
- `PURCHASE_REGISTRY_SHEET_NAME`: normalmente `REGISTRO`.

Importante: compartir el Google Sheet con el email de la service account con permiso de lectura.

## Comportamiento

1. La app llama a `/api/purchase-registry`.
2. Si responde `ok:true`, usa esas filas y muestra "Compras sincronizadas desde servidor".
3. Si responde `missing_server_google_config`, muestra "Servidor de compras no configurado".
4. Si mayo 2026 ya suma `712,81 EUR`, no abre OAuth antiguo innecesariamente.
5. Solo si el servidor no esta configurado y hace falta completar datos, permite fallback OAuth antiguo.
6. Si Google Sheets falla desde servidor, muestra "Google Sheets no accesible desde servidor".

## Seguridad

- La service account vive solo en Vercel.
- Safari/iPhone ya no necesita iniciar sesion Google para este sync cuando el servidor esta configurado.
- El endpoint solo lee `A2:V` del sheet configurado.
