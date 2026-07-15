# Operación y diagnóstico

## Arranque seguro

`npm run config:check` valida configuración antes de Compose. Fuera de desarrollo exige PostgreSQL, Redis y MinIO, separa rol migrador de rol API, rechaza placeholders, JWT corto, CORS wildcard, orígenes inválidos, credenciales MinIO predeterminadas y cookie insegura en producción.

Clasificación:

- obligatorias: `DATABASE_URL`, `JWT_SECRET`; fuera de desarrollo también `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY` y `S3_SECRET_KEY`;
- sensibles: contraseñas PostgreSQL/Redis/MinIO, JWT y `INTERNAL_METRICS_TOKEN`; solo se inyectan por entorno;
- opcionales acotadas: TTL, límites de importación, timeout, retenciones y tamaño de lote;
- desarrollo: cookie no Secure y dependencias omitidas solo se toleran en `APP_ENV=development`;
- integración: datos, usuarios, claves y artifacts deben ser inequívocamente ficticios;
- producción: cookie Secure, orígenes exactos, servicios completos y métricas sin exposición remota.

`GET /health` solo confirma que vive el proceso. `GET /ready` aplica un timeout corto y devuelve estados sanitizados de PostgreSQL, migraciones, rol API, Redis, MinIO, bucket y configuración. Nunca incluye hosts, URLs ni secretos.

Las migraciones se ejecutan en una ventana de mantenimiento, antes de iniciar la API. El orden de Compose (`migrate` → `provision-api-role` → `api`) es obligatorio; no se debe lanzar el migrador manualmente mientras exista una API atendiendo emisiones. Readiness carga el manifiesto `NNNN_*.sql` incluido en la imagen y compara todos sus nombres y SHA-256 con `schema_migrations`: cualquier archivo pendiente, inesperado o con checksum distinto mantiene PostgreSQL en estado `incomplete`.

La migración histórica `0009` toca facturas y secuencias. El runner adquiere primero `invoices` y después `document_sequences`, el mismo orden que la emisión, y usa un `lock_timeout` corto para fallar de forma recuperable si la ventana no está realmente libre.

## Logs y request IDs

Cada respuesta incluye `X-Request-Id`. La API acepta uno entrante solo si usa caracteres seguros y no supera 64; en caso contrario genera UUID. Los logs son una línea JSON con timestamp, level, requestId, método, ruta normalizada, estado, duración, identidad tenant cuando exista, código de error y versión.

No se registran Authorization, cookies, contraseñas, tokens, contenido de importación, direcciones, notas, PDF ni secretos. Los valores se truncan y se neutralizan controles y saltos de línea.

## Métricas internas

`GET /internal/metrics` expone contadores de peticiones, errores, duración, sesiones aproximadas, estados de importaciones/documentos y fallos operativos. En modo local solo se permite loopback; desde otra dirección exige `X-Operations-Token` independiente y fuerte. No se usa el JWT de usuario como control operacional.

## Retención

`npm run cleanup:imports -- --dry-run` requiere `CLEANUP_COMPANY_ID` y `CLEANUP_USER_ID`. Las retenciones de completados, cancelados y fallidos son independientes. Los lotes `pending`, `validated` o `importing` nunca se seleccionan. Cada empresa usa advisory lock, bloqueo de filas con `SKIP LOCKED`, límite por ejecución, cascada de filas y auditoría agregada sin datos importados.

## Respuesta breve a fallos

1. Conservar el request ID y comprobar `/health` y `/ready`.
2. Consultar solo logs sanitizados del servicio afectado.
3. No reintentar confirmaciones manualmente sin comprobar el estado transaccional.
4. Aislar el proyecto Compose; no abrir puertos ni cambiar RLS.
5. Si hay pérdida, seguir `DISASTER_RECOVERY.md` y conservar informes y manifiestos, nunca dumps como artifact público.
