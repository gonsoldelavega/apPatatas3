# CLAUDE.md — Guía para Claude en este proyecto

## Autorizaciones permanentes (el dueño las ha concedido)

- Claude **puede fusionar Pull Requests y desplegar a producción sin pedir confirmación** cada vez.
- Claude **puede hacer push a ramas de trabajo y a `main`** cuando el cambio esté verificado
  (sintaxis comprobada con `node --check`) y sea coherente con lo pedido.
- Aun así, **avisa claramente** de lo que has hecho y de cualquier riesgo relevante.
- No reintroduzcas IA/OCR/escáner ni cambios de arquitectura grandes sin pedirlo antes.

## Qué es este proyecto

PWA mobile-first de facturación y gestión para un negocio pequeño (patatas/hortalizas).
- **Fuente de verdad de las compras:** la hoja de Google Sheets `REGISTRO`
  (`Gonsol de la Vega - Registro maestro`), que alimenta la app vía `/api/purchase-registry`.
- **Supabase** es almacén secundario y suele estar **pausado** (plan gratis); no es la fuente principal.
- **Sin IA, sin OCR en la app, sin escáner**: se eliminaron. No volver a meterlos.

## El agente de facturas (Google Apps Script)

- Proyecto `Gonsol Drive Organizer` (carpeta `apps-script/gonsol-drive-organizer/`).
- Lee facturas de la bandeja de Drive (OCR gratis de Google), extrae datos por reglas,
  registra en `REGISTRO` y archiva en `02_COMPRAS/<año>/<trimestre>/<mes>`.
- Proveedores con parser propio: **GAYCA** (A04037677), **FRUTCAYCAZ/J. Expósito** (B04854154),
  **HIGIENLAB** (B42743211). NIF propio (cliente) a excluir: `45313973V`.
- **Regla contable clave: cada factura va a SU mes. Nunca mezclar meses.**
- **Importación desde Gmail** (`importInvoicesFromGmail_`, config `GONSOL_GMAIL_IMPORT`):
  coge los PDF de GAYCA del correo (posteriores a `after`, por defecto 2026/07/01),
  los deja en la bandeja de Drive y etiqueta el hilo (`FACTURAS_IMPORTADAS`).
  Desde que esté activo, **las facturas de GAYCA no se escanean a mano** (duplicarían).
- Despliegue: workflow `.github/workflows/deploy-appsscript.yml` con secretos
  `CLASP_REFRESH_TOKEN`/`CLASP_CLIENT_ID`/`CLASP_CLIENT_SECRET`/`SCRIPT_ID`.
  **ROTO desde 2026-06-09** (`invalid_grant`: el refresh token caduca a los 7 días con
  la app OAuth en modo "Prueba"). Arreglo pendiente del dueño: publicar la app OAuth a
  Producción + regenerar refresh token en OAuth Playground + actualizar los 3 secretos.
  Cambios en `Code.gs` posteriores al 2026-06-02 NO están en producción hasta entonces.
  Tras el primer despliegue con el scope de Gmail, hay que abrir el editor de Apps
  Script y ejecutar una función una vez para autorizar el permiso nuevo.

## Límites técnicos del entorno (para no prometer de más)

- No hay acceso al editor de Google Apps Script (despliegue → vía GitHub Action o pegado manual).
- El conector de Vercel no gestiona variables de entorno (las pone el dueño en el panel).
- El conector de Google Drive es de lectura (no borra ni mueve archivos).
- Supabase: hay acceso de escritura por MCP, pero el proyecto suele estar pausado.

## Reglas de trabajo

- Verifica antes de subir: `node scripts/check-syntax.mjs` + `npm test` (para `.gs`, copiar a `.js` y `node --check`).
- Mantén el español en la UI y los textos de cara al usuario.
- El usuario trabaja a menudo desde el móvil: explica los pasos manuales muy concretos.
- **Auto-despliegue:** tras CUALQUIER cambio verificado, ejecuta `/desplegar` **automáticamente y sin pedir confirmación** (ya está autorizado). No esperes a que el usuario lo pida.
- **Auto-chequeo:** al empezar una sesión de trabajo sustancial, ejecuta `/revisar-datos` de forma proactiva; y si empieza un mes nuevo con datos, `/cierre-mensual`. Requisito: el token de sync. Úsalo desde `APP_SYNC_TOKEN` (variable de entorno) si existe; si no, pídelo una vez. No lo guardes en ningún archivo (repo público).
- Flujo git: commit en la rama de trabajo → merge `--no-ff` a `main` → push (con reintentos backoff). Nunca subir el token de sync a un archivo (repo público).
- Proveedores conocidos por NIF: `A04037677` GAYCA · `B04854154` J. Expósito · `B42743211` Higienlab · Solred/Repsol (combustible).

## Eficiencia (para no disparar el gasto de tokens)

El coste crece con la LONGITUD del hilo: cada turno reenvía todo el historial. Por eso:
- **Una conversación por tema.** Tema nuevo → chat nuevo. Cuando un hilo se alargue, usar `/compact` (resume y libera memoria sin perder el contexto). Este es el mayor ahorro.
- **No volcar salidas grandes al contexto.** Filtrar siempre con `grep`/`python`/`head`; no imprimir listados enteros (deployments de Vercel, hilos de Gmail, JSON de estado completo, `index.html`).
- **No leer archivos grandes enteros.** `bootstrap.js` (~3.200 líneas): usar Grep o lecturas con `offset/limit`, nunca de una vez.
- **Respuestas al grano**, sin repetir lo ya dicho.
