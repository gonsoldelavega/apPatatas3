# Arquitectura inicial

## Alcance validado

FactuPapa Next vive dentro de `factupapa-next/` y no comparte ejecución, dependencias, datos ni configuración con la aplicación actual. La separación permite evolucionar el sistema sin alterar producción.

La base existente es coherente con el documento de producto:

- PostgreSQL conserva los datos estructurados y económicos.
- MinIO ofrece almacenamiento S3 compatible para documentos propios.
- Redis queda preparado para colas y procesos asíncronos futuros.
- La API es el único punto de entrada previsto para clientes web y móvil.
- Las migraciones SQL son explícitas, ordenadas y registradas.

## Componentes actuales

```text
cliente futuro
    |
    v
API Node.js/TypeScript -- PostgreSQL
          | futuro
          +------------ Redis --> worker futuro
          | futuro
          +------------ MinIO
```

El Compose de desarrollo levanta seis servicios:

1. `postgres`: PostgreSQL 16 con volumen persistente y healthcheck.
2. `redis`: Redis 7 con contraseña y persistencia AOF.
3. `minio`: almacenamiento de objetos con volumen persistente.
4. `create-buckets`: crea de forma idempotente el bucket privado inicial.
5. `migrate`: aplica una sola vez cada migración pendiente y termina.
6. `api`: arranca únicamente después de una migración correcta.

Los puertos de desarrollo se publican solo en `127.0.0.1`. Esta configuración no es una receta de producción: no incluye proxy HTTPS, copias externas, observabilidad ni endurecimiento del host.

## Backend mínimo

La API evita introducir todavía un framework y mantiene límites simples:

- `config.ts`: lectura y validación de configuración.
- `database/client.ts`: conexión y comprobación de PostgreSQL.
- `app.ts`: transporte HTTP y rutas.
- `server.ts`: composición, arranque y cierre ordenado.
- `database/migrate.ts`: control transaccional de migraciones.

Rutas disponibles:

- `GET /health`: prueba de vida de la API; no depende de servicios externos.
- `GET /ready`: prueba de disponibilidad que exige conexión con PostgreSQL.

## Migraciones

El migrador busca nombres con formato `NNNN_nombre.sql`, calcula SHA-256 y registra cada archivo en `schema_migrations`. Cada migración nueva se aplica dentro de una transacción y bajo un bloqueo asesor de PostgreSQL para evitar ejecuciones concurrentes.

Una migración ya aplicada no se repite. Si su contenido cambia, el proceso falla: los cambios de esquema deben añadirse en un archivo nuevo, nunca reescribiendo el historial aplicado.

## Decisiones pendientes

- Autenticación y autorización de usuario único.
- Políticas de aislamiento multiempresa y eventual Row Level Security.
- API de dominio para clientes, productos, facturas y cobros.
- Worker de colas y contratos de trabajos asíncronos.
- Integración real de documentos con MinIO.
- Copias, restauración, HTTPS, métricas y logs estructurados antes de cualquier uso real.
