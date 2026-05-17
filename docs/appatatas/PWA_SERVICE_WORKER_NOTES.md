# PWA Service Worker Notes

## Cambios seguros

- Cache versionada como `factupapa-2026-05-17-night-run`.
- `/api/*` se sirve siempre con red y `cache: no-store`.
- Peticiones a Supabase no se cachean.
- Los caches antiguos se limpian en `activate`.
- Solo se guardan respuestas `ok` en cache.

## Forzar actualizacion

1. Abrir la app con conexion.
2. Volver a enfocar la ventana o pulsar el boton de instalacion/actualizacion si aparece.
3. El service worker llama a `SKIP_WAITING` y recarga cuando toma control.

## iPhone

Se mantiene `skipWaiting`, `clients.claim` y app shell basica. No se cambia el manifest ni la instalacion iOS.
