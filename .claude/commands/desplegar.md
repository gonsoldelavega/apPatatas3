---
description: Despliega Factupapa a producción de forma autónoma, reanudable y verificada
---

# Desplegar Factupapa

Este workflow publica cambios de aplicación ya autorizados por el usuario.

**No crea puertas de aprobación adicionales.** Sigue la política de autonomía, aprobaciones y verificación de `AGENTS.md`.

No pidas confirmación por estar en `main`, por hacer commit/push/merge, por elegir una etiqueta técnica o por desplegar un cambio de aplicación verificado que el usuario ya pidió.

`$ARGUMENTS` puede contener una etiqueta corta para versión/commit. Si está vacío, deriva una etiqueta breve del cambio actual; si no es fiable, usa `cambios`. No preguntes al usuario solo por una etiqueta.

## 1. Determina el estado real pendiente

No uses únicamente `git status --short` para decidir si hay algo que publicar.

Inspecciona como mínimo:

- rama actual;
- cambios sin commit;
- commits de la rama actual que no estén en `main`;
- commits de `main` que no estén en `origin/main`;
- versión de caché de `HEAD`, `main` y producción cuando sea relevante.

Considera trabajo pendiente cualquiera de estos estados:

1. cambios de aplicación sin commit;
2. commits de una rama de trabajo todavía no integrados en `main`;
3. commits de `main` todavía no enviados a `origin/main`;
4. `main` ya enviado pero producción todavía no verificada.

Si no existe trabajo pendiente, verifica de forma breve que producción corresponde al `main` actual y termina informando `sin publicación pendiente`. No trates un working tree limpio como prueba suficiente por sí sola.

## 2. Prepara el bump de caché solo cuando haga falta

La versión de assets usa `?v=YYYYMMDD<letra>` y `sw.js` usa `CACHE_VERSION`.

Antes de modificarla, comprueba si el trabajo pendiente **ya contiene** un bump de caché respecto al `main`/estado base que va a reemplazar.

- Si el cambio pendiente ya contiene un bump coherente, reutilízalo. No generes un segundo bump solo porque el workflow se reanudó.
- Si hay cambios de aplicación pendientes y todavía no existe un bump para ese conjunto de cambios, genera uno.
- Si solo se están publicando cambios de documentación/instrucciones que no afectan a la app servida, no fuerces un bump de caché ni un despliegue web innecesario.

Para generar un bump nuevo:

1. Lee la versión actual con `grep -oE '\?v=[0-9]{8}[a-z]' index.html | head -1`.
2. Usa la fecha actual proporcionada por el entorno/sistema; no confíes ciegamente en un reloj del shell si difiere.
3. Si la fecha coincide, incrementa la letra; si es un día nuevo, usa `a`.
4. Sustituye la versión de assets en los archivos que realmente contienen el token actual, comprobando el resultado después.
5. Actualiza `sw.js` a `const CACHE_VERSION = "YYYY-MM-DD<letra>-<etiqueta>";`.

No dependas de un número fijo como “~60 apariciones”: cuenta/comprueba las coincidencias reales antes y después.

## 3. Verifica antes de publicar

Un cambio de aplicación solo está verificado cuando cumple `AGENTS.md`.

Ejecuta:

- `node scripts/check-syntax.mjs`
- `npm test`
- comprobaciones adicionales relevantes para los archivos tocados
- si cambió `apps-script/gonsol-drive-organizer/Code.gs`: copia temporalmente a `.js` y ejecuta `node --check`

### Si falla una validación bloqueante

No publiques el estado roto.

1. diagnostica la causa;
2. corrígela si está dentro del alcance ya autorizado;
3. repite la validación;
4. continúa automáticamente cuando quede verde.

Solo termina bloqueado si después de un intento razonable sigue existiendo un fallo real que no puede resolverse con seguridad.

### Si falla una operación recuperable

Errores temporales de red, GitHub, Vercel o consultas de estado no son motivo para pedir al usuario que continúe.

Reintenta automáticamente con backoff acotado, por ejemplo 2/4/8/16 segundos, y diagnostica si persiste.

## 4. Commit, push y merge según el estado de partida

### Si estás en una rama de trabajo

- incorpora al commit únicamente el trabajo perteneciente al alcance actual;
- crea commit si quedan cambios sin commit;
- push de la rama con reintentos acotados;
- integra la rama en `main` con merge no fast-forward cuando corresponda;
- resuelve conflictos solo si la resolución es clara y está dentro del alcance;
- push de `main` con reintentos acotados.

### Si estás en `main`

No pidas aprobación únicamente por ese motivo.

- crea commit si quedan cambios sin commit;
- push de `main` con reintentos acotados.

No intentes fusionar `main` consigo misma.

### Si el trabajo ya estaba commiteado

No termines por no encontrar cambios sin commit. Publica los commits pendientes que ya existan y continúa hasta el estado final correspondiente.

## 5. Verifica producción sin bucles infinitos

Cuando el cambio afecta a la app desplegada, comprueba que la nueva versión esté viva en producción.

Haz un máximo de **15 intentos** separados aproximadamente 8 segundos. No uses un `until` sin límite.

Si la versión todavía no aparece después de esos intentos:

1. confirma que el commit esperado está en `origin/main`;
2. consulta el estado del deployment/build si las herramientas disponibles lo permiten;
3. revisa errores de build/runtime relevantes;
4. distingue retraso de propagación de fallo real.

Si no puede verificarse producción, termina con un estado preciso, por ejemplo:

- `main publicado; deployment fallido por <causa>`;
- `main publicado; producción aún no verificable por <causa>`.

No declares éxito de producción si no lo has comprobado.

## 6. Apps Script

Si cambió `apps-script/gonsol-drive-organizer/Code.gs`, verifica además el workflow/estado real de despliegue de Apps Script cuando sea posible.

No asumas que un fallo OAuth documentado históricamente sigue vigente. Comprueba el estado actual antes de afirmarlo.

Si existe un paso interactivo de autorización que las herramientas no pueden completar, termina con el código publicado hasta el último punto verificable y describe ese bloqueo externo exacto.

## 7. Resumen final

Informa de forma concisa:

- qué se publicó;
- rama/commit final relevante;
- versión de caché si cambió;
- verificaciones ejecutadas y resultado;
- estado de producción;
- cualquier bloqueo real pendiente.

Si se publicó una nueva versión web, recuerda al usuario cerrar completamente y reabrir la app móvil solo cuando eso sea útil para forzar la carga del nuevo cache.

## Salvaguardas

- El repositorio es público: nunca metas secretos, tokens, claves o credenciales en commits.
- No alteres datos contables/de negocio como parte de este workflow.
- No uses este workflow para introducir lógica de negocio nueva: publica el trabajo ya autorizado y preparado.
- No saltes tests obligatorios para conseguir un despliegue verde.
