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
- `auth/`: contraseñas, tokens, sesiones, repositorio y bootstrap inicial.

Rutas disponibles:

- `GET /health`: prueba de vida de la API; no depende de servicios externos.
- `GET /ready`: prueba de disponibilidad que exige conexión con PostgreSQL.
- `POST /auth/login`: autenticación con email y contraseña.
- `POST /auth/refresh`: rotación de refresh token.
- `POST /auth/logout`: revocación de la familia de sesión.
- `GET /me`: identidad, empresa y rol de la sesión activa.

No existen todavía endpoints económicos.

## Autenticación inicial

El modelo de identidad está preparado para varias empresas aunque la primera beta solo permite una:

- `companies`: empresas, con UUID como clave primaria.
- `users`: identidad global y contraseña Argon2id.
- `memberships`: relación compuesta empresa/usuario y rol.
- `auth_sessions`: cadenas de refresh tokens, siempre almacenados como SHA-256.
- `audit_events`: eventos UUID; `company_id` puede ser nulo cuando un login fallido no identifica empresa.

La migración `0002_authentication.sql` renombra las tablas iniciales `organizations` y `organization_members` sin perder datos y añade constraints compuestas por `company_id` a las relaciones existentes.

### Decisiones de seguridad

- Contraseñas: Argon2id, 19 MiB de memoria, dos iteraciones y paralelismo uno. Longitud admitida: 14–128 caracteres.
- Access token: JWT HS256, audiencia e issuer fijos y caducidad predeterminada de 15 minutos.
- Refresh token: 256 bits aleatorios, duración predeterminada de 30 días y solo su hash SHA-256 llega a PostgreSQL.
- Rotación: cada refresh crea una fila nueva y revoca la anterior dentro de una transacción bloqueada.
- Reutilización: presentar un refresh revocado invalida todos los tokens activos de su familia.
- Logout: revoca toda la familia. `/me` exige que esa familia siga activa, por lo que el access token deja de servir inmediatamente.
- Enumeración: email desconocido y contraseña incorrecta devuelven exactamente `invalid_credentials`; se verifica un hash Argon2id ficticio para reducir diferencias temporales.
- Rate limiting: ventana en memoria por dirección remota. Antes de escalar a varias API se moverá a Redis para compartir contadores.
- Logs y auditoría: no se escriben contraseñas ni tokens. Se auditan bootstrap, login correcto/fallido, refresh, reutilización y logout.

El secreto JWT debe tener al menos 32 bytes y solo se suministra mediante entorno. No existe endpoint de registro ni recuperación de contraseña en esta fase.

## Migraciones

El migrador busca nombres con formato `NNNN_nombre.sql`, calcula SHA-256 y registra cada archivo en `schema_migrations`. Cada migración nueva se aplica dentro de una transacción y bajo un bloqueo asesor de PostgreSQL para evitar ejecuciones concurrentes.

Una migración ya aplicada no se repite. Si su contenido cambia, el proceso falla: los cambios de esquema deben añadirse en un archivo nuevo, nunca reescribiendo el historial aplicado.

## Decisiones pendientes

- Recuperación y cambio de contraseña, segundo factor y gestión de dispositivos.
- API de dominio para clientes, productos, facturas y cobros.
- Worker de colas y contratos de trabajos asíncronos.
- Integración real de documentos con MinIO.
- Copias, restauración, HTTPS, métricas y logs estructurados antes de cualquier uso real.

## Plan exacto para Row Level Security

RLS no se activa en esta fase para no mezclar el primer login con cambios de rol de base de datos. Se añadirá antes de exponer endpoints económicos siguiendo estos pasos:

1. Crear un rol propietario de migraciones sin login y un rol de API sin `BYPASSRLS`; la API no será propietaria de tablas.
2. Tras validar el access token, abrir una transacción y ejecutar `select set_config('app.user_id', $1, true)` y `select set_config('app.company_id', $1, true)` con parámetros UUID; el tercer argumento limita ambos valores a la transacción.
3. Activar y forzar RLS (`enable row level security` y `force row level security`) en toda tabla con `company_id`.
4. Crear políticas `using` y `with check` que exijan `company_id = current_setting('app.company_id', true)::uuid`.
5. En tablas vinculadas a usuario, exigir además una membership activa para `current_setting('app.user_id', true)::uuid`.
6. Encapsular login y rotación —donde todavía no se conoce `company_id`— en funciones `security definer` mínimas, con `search_path` fijo y permisos de ejecución exclusivos para el rol API.
7. Añadir pruebas negativas entre dos empresas que demuestren que lectura, escritura, relaciones y auditoría cruzadas son imposibles.
