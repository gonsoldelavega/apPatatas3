# Auto-despliegue del agente a Google Apps Script

El agente de compras se publica automaticamente desde la rama canonica
`codex/factupapa-next-quality-sweep` mediante `.github/workflows/deploy-appsscript.yml`.

El workflow usa `@google/clasp@3.3.0`, autentica con una credencial OAuth de tipo
`authorized_user` y, despues del push, consulta la Apps Script API para comprobar que
`Code.gs` y `appsscript.json` remotos coinciden exactamente con los archivos del SHA
que disparo el despliegue. Si `clasp` informa un error o la fuente remota no coincide,
el job falla; no se acepta un falso positivo de despliegue.

## Secretos necesarios en GitHub

En `Settings -> Secrets and variables -> Actions` deben existir estos cuatro secretos:

| Secreto | Contenido |
| --- | --- |
| `CLASP_REFRESH_TOKEN` | Refresh token OAuth de la cuenta que administra el Apps Script |
| `CLASP_CLIENT_ID` | Client ID OAuth usado para generar ese refresh token |
| `CLASP_CLIENT_SECRET` | Client secret correspondiente |
| `SCRIPT_ID` | ID del proyecto de Google Apps Script |

No se usa `CLASPRC_JSON`.

## Disparador

El despliegue se ejecuta al hacer push a `codex/factupapa-next-quality-sweep` cuando
cambia alguno de estos paths:

- `apps-script/gonsol-drive-organizer/**`
- `.github/workflows/deploy-appsscript.yml`

Tambien puede lanzarse manualmente con `workflow_dispatch` desde GitHub Actions.

## Autorizacion de los servicios del propio script

`clasp` publica el codigo, pero los permisos de ejecucion del Apps Script pertenecen a
la cuenta de Google que ejecuta sus funciones/triggers. Si se anade un scope nuevo al
`appsscript.json` (por ejemplo Gmail), Google puede exigir una autorizacion interactiva
una vez. En ese caso, abrir el proyecto en Apps Script y ejecutar `autorizarPermisos`;
la funcion solo toca Gmail/Drive para forzar la pantalla de consentimiento y no altera
datos.

## Verificacion del despliegue

Un despliegue valido debe completar estas etapas del workflow:

1. `Push a Apps Script`
2. `Verificar fuente remota exacta`

La segunda etapa obtiene un access token con los secretos OAuth, lee
`projects/{SCRIPT_ID}/content` desde la Apps Script API y compara byte a byte el
`Code.gs` y el `appsscript.json` remotos con el checkout del SHA desplegado.
