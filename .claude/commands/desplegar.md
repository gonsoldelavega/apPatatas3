---
description: Despliega Factupapa a producción (bump de caché + tests + commit + merge a main + verificación)
---

Despliega los cambios actuales de Factupapa a producción de forma consistente y sin olvidar pasos. Ejecuta en orden. Si algo falla, PARA y reporta; no sigas.

`$ARGUMENTS` = etiqueta corta para la versión y el commit (p.ej. `orden-entrega`). Si viene vacío, pide una etiqueta breve o usa `cambios`.

## Pasos

1. **Comprueba que hay algo que desplegar**: `git status --short`. Si no hay cambios sin commitear, avisa y para.

2. **Calcula la nueva versión de caché** (formato `?v=YYYYMMDD` + una letra):
   - Versión actual: `grep -oE '\?v=[0-9]{8}[a-z]' index.html | head -1` → da `?v=YYYYMMDDx`.
   - Usa la fecha de HOY (mírala en `currentDate` del system prompt, no en `date` del shell si difieren).
   - Si la fecha de hoy coincide con la de la versión actual → sube la letra (`a`→`b`→`c`…). Si es un día nuevo → letra `a`.
   - Ej.: actual `20260704a`, hoy 2026-07-04 → nueva `20260704b`. Actual `20260703b`, hoy 2026-07-04 → `20260704a`.

3. **Aplica el bump** (la versión aparece idéntica en ~60 sitios):
   - `sed -i 's/?v=<ACTUAL>/?v=<NUEVA>/g' index.html src/styles/themes.css`
   - En `sw.js`, pon: `const CACHE_VERSION = "YYYY-MM-DD<letra>-<etiqueta>";` (fecha con guiones + letra + `$ARGUMENTS`).

4. **Verifica** (obligatorio antes de subir):
   - `node scripts/check-syntax.mjs` → debe decir "OK: N archivos".
   - `npm test` → todos verdes.
   - Si además tocaste `apps-script/gonsol-drive-organizer/Code.gs`, compruébalo: `cp .../Code.gs /tmp/c.js && node --check /tmp/c.js`.
   - Si falla cualquier cosa, PARA y reporta.

5. **Commit + merge + push** (rama de trabajo de la sesión; si estás en `main`, avisa antes):
   - `git add -A && git commit -m "<etiqueta>: <descripción breve real de los cambios>"`
   - Push de la rama con reintentos (backoff 2/4/8/16 s).
   - `git checkout main && git merge --no-ff <rama> -m "Merge: <etiqueta>"`
   - Push a `main` con reintentos.

6. **Verifica producción** (que la versión nueva esté viva):
   - `until curl -s "https://ap-patatas3.vercel.app/index.html?cb=$RANDOM" | grep -q "<NUEVA>"; do sleep 8; done`
   - Confirma "<NUEVA> vivo en producción".

7. **Resume**: versión desplegada, archivos tocados, tests OK. Recuérdale al usuario **cerrar la app del todo y reabrirla** en el móvil para coger la versión nueva.

## Notas
- El repo es público: nunca metas secretos (token de sync, claves) en commits.
- No toques lógica de negocio en este comando; solo despliega lo que ya haya cambiado.
