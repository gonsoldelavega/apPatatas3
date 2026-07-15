# Seguridad de la sesión web

El access token solo existe en memoria. El refresh token no forma parte de ninguna respuesta JSON y se entrega en `factupapa_refresh`, una cookie `HttpOnly`, `SameSite=Strict`, `Path=/auth` y `Max-Age` igual a `REFRESH_TOKEN_TTL_DAYS`. `Secure` se controla con `AUTH_COOKIE_SECURE` y debe ser `true` detrás de HTTPS. La web comparte una sola promesa por pestaña y serializa la rotación entre pestañas mediante Web Locks para evitar reutilización accidental de la familia.

Login, refresh y logout rechazan un `Origin` ausente o distinto de `CORS_ALLOWED_ORIGINS`. CORS nunca usa wildcard, solo devuelve credenciales al origen permitido y añade `Vary: Origin`. Logout usa la cookie y funciona con access token caducado. Rotación, detección de reutilización y revocación familiar permanecen en PostgreSQL.

API y Nginx añaden CSP sin `unsafe-inline` ni `unsafe-eval`, `nosniff`, política de referrer, permisos vacíos y prohibición de framing. El build no genera sourcemaps y el service worker no cachea API ni respuestas autenticadas.

Antes de producción siguen siendo obligatorios HTTPS, `AUTH_COOKIE_SECURE=true`, secretos externos, copias, observabilidad y revisión de seguridad.
