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
- Despliegue: lo hace el workflow `.github/workflows/deploy-appsscript.yml` al hacer push,
  **si** existen los secretos `CLASPRC_JSON` y `SCRIPT_ID` en GitHub. Si no, hay que pegar
  `Code.gs` a mano en el editor de Apps Script (no hay acceso a Apps Script desde aquí).

## Límites técnicos del entorno (para no prometer de más)

- No hay acceso al editor de Google Apps Script (despliegue → vía GitHub Action o pegado manual).
- El conector de Vercel no gestiona variables de entorno (las pone el dueño en el panel).
- El conector de Google Drive es de lectura (no borra ni mueve archivos).
- Supabase: hay acceso de escritura por MCP, pero el proyecto suele estar pausado.

## Reglas de trabajo

- Verifica la sintaxis antes de subir (`node --check`; para `.gs`, copiar a `.js` y comprobar).
- Mantén el español en la UI y los textos de cara al usuario.
- El usuario trabaja a menudo desde el móvil: explica los pasos manuales muy concretos.
