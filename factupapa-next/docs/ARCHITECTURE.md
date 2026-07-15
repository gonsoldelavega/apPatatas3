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
PWA React/TypeScript
    |
    v
API Node.js/TypeScript -- PostgreSQL
          | futuro
          +------------ Redis --> worker futuro
          | futuro
          +------------ MinIO
```

El Compose de desarrollo levanta ocho servicios:

1. `postgres`: PostgreSQL 16 con volumen persistente y healthcheck.
2. `redis`: Redis 7 con contraseña y persistencia AOF.
3. `minio`: almacenamiento de objetos con volumen persistente.
4. `create-buckets`: crea de forma idempotente el bucket privado inicial.
5. `migrate`: aplica una sola vez cada migración pendiente y termina.
6. `provision-api-role`: establece la credencial local del rol PostgreSQL limitado sin imprimirla.
7. `api`: arranca únicamente después de migrar y provisionar el rol limitado.
8. `web`: compila la PWA y la sirve con Nginx solo en `127.0.0.1`, después del healthcheck de la API.

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
- CRUD autenticado `/contacts` para clientes y proveedores.
- CRUD autenticado `/products` para productos.
- `/contacts/:contactId/products` y `/contacts/:contactId/products/:productId/price` para precios efectivos.
- `/imports/validate`, `/imports`, `/imports/:id`, `/imports/:id/confirm` y `/imports/:id/cancel` para importación en dos fases.

Existen endpoints iniciales de albaranes y facturas de venta. Pagos, stock y demás movimientos económicos siguen fuera de alcance.

## Cliente web y límites de confianza

`apps/web` se organiza por límites explícitos: `api/` centraliza transporte y contratos; `auth/` mantiene la sesión; `pages/` compone flujos; `layout/`, `ui/`, `forms/`, `pricing/` e `imports/` contienen piezas reutilizables. Las páginas se cargan de forma diferida y TanStack Query gestiona exclusivamente estado remoto. No se ha copiado lógica del prototipo ni de producción.

El frontend nunca acepta ni envía `company_id`: la empresa procede del access token y PostgreSQL mantiene RLS como barrera definitiva. Los tipos de respuesta tampoco exponen `company_id`, de modo que una respuesta accidental no se representa en pantalla. Al iniciar o cerrar sesión se vacía por completo la caché remota para impedir que datos de una empresa anterior sobrevivan a un cambio de identidad futuro. El cliente aplica timeout con `AbortController`, normaliza 400/401/404/409/413 y no registra tokens ni payloads sensibles.

Los importes siguen siendo strings decimales hasta su presentación. El formateador agrupa la parte entera mediante `BigInt` y conserva hasta cuatro decimales sin pasar por `Number`. La PWA solo precachea sus recursos estáticos; nunca guarda respuestas autenticadas de la API.

### Sesión del navegador

El access token vive en memoria. El refresh rotatorio usa exclusivamente cookie `HttpOnly`, `SameSite=Strict`, `Path=/auth` y `Secure` configurable; JavaScript no puede leerlo. La restauración tras recarga llama una vez a refresh y la defensa CSRF exige `Origin` exacto en todos los POST de autenticación.

Solo existe una promesa de refresh concurrente. Después de renovar, el cliente puede repetir GET/HEAD/OPTIONS; nunca repite POST/PUT/PATCH/DELETE, porque podría duplicar un alta o confirmación. En ese caso informa de que la sesión se renovó y exige repetir conscientemente la acción.

### CORS

La API compara `Origin` contra la lista exacta `CORS_ALLOWED_ORIGINS`. No acepta `*`, rutas ni patrones. Los preflight no permitidos reciben 403 y no incluyen cabeceras CORS. El Compose de integración autoriza únicamente `http://127.0.0.1:4173`; cualquier despliegue futuro deberá declarar su origen HTTPS exacto.

## Primer dominio funcional

La API separa transporte, validación, servicio, repositorio y tipos en `contacts/`, `products/` y `pricing/`. `app.ts` solo compone rutas, healthchecks y errores comunes. Cada ruta autentica el access token y el servicio abre una nueva `withTenantTransaction`; ningún repositorio de dominio recibe ni usa el pool directamente.

### Contactos

`contacts.kind` distingue `customer`, `supplier` y `both`. El modelo incluye nombre legal, nombre comercial, NIF opcional, email, teléfono, dirección JSON estructurada, notas y `is_active`. Un índice único parcial normaliza mayúsculas y espacios externos del NIF dentro de cada empresa. La búsqueda abarca nombres, NIF, email y teléfono, y todo orden añade el UUID como desempate estable.

La dirección admite exclusivamente `street`, `line2`, `postalCode`, `city`, `province` y `country`; PostgreSQL comprueba que siempre sea un objeto JSON y la API valida claves y longitudes.

### Productos y precisión monetaria

Los productos admiten `kg`, `g`, `unit`, `box` y `custom`. `sale_price` y `estimated_cost` son `numeric(14,4)`; `tax_rate` es `numeric(6,3)`. La API exige cadenas decimales para evitar que JSON/JavaScript convierta importes a coma flotante. El SKU es único por empresa sin distinguir mayúsculas ni espacios externos.

El margen no se almacena. La respuesta lo calcula con enteros escalados a partir del precio y coste devueltos por PostgreSQL, incluyendo importe y porcentaje; si no existe coste, el margen es `null`.

### Precios específicos y bajas

`contact_product_prices` relaciona empresa, cliente y producto mediante FKs tenant compuestas. Mantiene precio `numeric(14,4)`, `valid_from`, `is_active` y timestamps. Solo puede existir una configuración actual por pareja. El precio efectivo es el específico cuando está activo y vigente; en cualquier otro caso es `products.sale_price`.

Los `DELETE` de contactos, productos y precios son bajas lógicas (`is_active = false`). No se destruyen filas ni referencias. Un trigger compartido establece `updated_at = now()` en cualquier actualización de contactos, productos o precios, incluso si una futura operación no pasa por la API.

Altas, actualizaciones, bajas y cambios de precio se escriben en `audit_events` dentro de la misma transacción que el dato modificado.

## Importación segura en dos fases

`imports/` separa parser, normalización, validación, repositorio, servicio, rutas y tipos. El parser acepta exclusivamente CSV UTF-8 o JSON estructurado, usa decodificación UTF-8 fatal, rechaza controles binarios y limita bytes y filas antes de persistir. Las claves desconocidas y cualquier `company_id` o `companyId` quedan fuera del contrato.

La validación calcula SHA-256 sobre entidad, formato y bytes exactos, normaliza cada fila, detecta duplicados internos y consulta conflictos bajo `withTenantTransaction`. `import_batches` contiene estado, autor, checksum y resumen; `import_batch_rows` conserva solo la representación normalizada, errores y warnings necesarios para confirmar. Ambas tablas están ligadas por `company_id`, usan RLS forzado y no guardan el archivo completo.

Una fila queda clasificada como `new`, `possible_update`, `duplicate`, `conflict` o `error`. La confirmación bloquea el lote con `FOR UPDATE` y admite `skip_existing`, `update_existing` o `fail_on_conflict`. Todo el catálogo se modifica en una única transacción: un error revierte todas las filas y una transacción tenant separada conserva el estado `failed` y un diagnóstico no sensible. El mismo lote nunca puede confirmarse dos veces, aunque lleguen dos peticiones concurrentes.

Los contactos se resuelven por NIF normalizado; los productos, por SKU; y los precios, por la pareja NIF/SKU. Un precio exige un contacto cliente o mixto. Los importes siguen siendo strings decimales hasta PostgreSQL. Las previsualizaciones anteponen un apóstrofo a valores que parecen fórmulas para que una futura exportación no los ejecute; el backend nunca evalúa fórmulas.

## Autenticación inicial

El modelo de identidad está preparado para varias empresas aunque la primera beta solo permite una:

- `companies`: empresas, con UUID como clave primaria.
- `users`: identidad global y contraseña Argon2id.
- `memberships`: relación compuesta empresa/usuario y rol.
- `auth_sessions`: cadenas de refresh tokens, siempre almacenados como SHA-256.
- `audit_events`: eventos UUID; `company_id` puede ser nulo cuando un login fallido no identifica empresa.

La migración `0002_authentication.sql` renombra las tablas iniciales `organizations` y `organization_members` sin perder datos y añade constraints compuestas por `company_id` a las relaciones existentes. La migración aditiva `0003_row_level_security.sql` separa roles, activa RLS y crea las políticas de aislamiento.

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
- Cobros, rectificativas reales y cumplimiento fiscal; albaranes y facturas iniciales ya están aislados.
- Worker de colas y contratos de trabajos asíncronos.
- Integración real de documentos con MinIO.
- Copias, restauración, HTTPS, métricas y logs estructurados antes de cualquier uso real.

## Aislamiento multiempresa con Row-Level Security

### Modelo de amenazas

RLS es una segunda barrera frente a un filtro omitido, un UUID manipulado, la reutilización incorrecta de una conexión del pool o un error futuro en un repositorio. No protege frente a quien obtenga credenciales administrativas, comprometa el host o modifique migraciones; esas credenciales nunca se entregan al proceso API y requieren protección operativa separada.

El atacante considerado puede controlar parámetros HTTP y tokens propios, pero no el secreto JWT ni las credenciales PostgreSQL administrativas. Aunque una consulta omita `where company_id = ...`, PostgreSQL debe ocultar filas ajenas y rechazar escrituras cruzadas.

### Roles PostgreSQL

- El usuario definido por `POSTGRES_USER` administra el contenedor y conecta exclusivamente al migrador y al bootstrap. No llega al servicio API.
- `factupapa_migrator` es `NOLOGIN`, posee tablas, tipos y funciones y tiene `BYPASSRLS` únicamente para migraciones y las tres funciones preautenticadas revisadas. Las migraciones futuras ejecutan `SET LOCAL ROLE factupapa_migrator`.
- `factupapa_api` tiene `LOGIN`, `NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT` y `NOBYPASSRLS`. No posee tablas y no puede desactivar RLS. Su contraseña se provisiona desde el entorno después de migrar.

Todas las tablas protegidas usan `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`: `companies`, `users`, `memberships`, `contacts`, `products`, `contact_product_prices`, `invoices`, `invoice_lines`, `payments`, `documents`, `audit_events`, `import_batches`, `import_batch_rows`, `auth_sessions`, `document_sequences`, `delivery_notes`, `delivery_note_lines` e `invoice_delivery_notes`.

`companies` compara su `id` con la empresa actual. `users` compara su `id` con el usuario actual. `memberships` y `auth_sessions` exigen simultáneamente empresa y usuario. El resto compara `company_id`. Cada política incluye `USING` y `WITH CHECK`, por lo que también impide mover una fila a otra empresa mediante `UPDATE`.

`schema_migrations` es la única tabla global sin RLS: contiene checksums técnicos, no datos empresariales, y el rol API no tiene permisos sobre ella.

### Contexto por transacción

`withTenantTransaction` obtiene una conexión, inicia `BEGIN` y ejecuta:

```sql
select
  set_config('app.current_company_id', $1::uuid::text, true),
  set_config('app.current_user_id', $2::uuid::text, true);
```

El tercer argumento `true` hace ambos valores locales a la transacción. La abstracción confirma al terminar, revierte ante cualquier error y siempre libera la conexión. No se usa `SET` persistente ni estado de sesión; fuera de una transacción contextual las políticas devuelven cero filas o rechazan escrituras.

### Excepciones de autenticación

Antes de validar credenciales o un refresh token todavía no existe un contexto confiable. El rol API solo puede ejecutar tres funciones `SECURITY DEFINER`, con `search_path` fijo, parámetros y privilegios revocados a `PUBLIC`:

- `auth_lookup_user`: lookup de login necesario para verificar Argon2id.
- `auth_resolve_refresh_tenant`: resuelve solo empresa y usuario a partir del hash del refresh; inmediatamente después la misma transacción fija el contexto y vuelve a leer/bloquear la sesión bajo RLS antes de modificarla.
- `auth_record_anonymous_login_failure`: registra un fallo sin empresa cuando el email es desconocido.

Bootstrap y migraciones usan `DATABASE_ADMIN_URL` fuera del proceso API. `/health` no consulta datos y `/ready` solo ejecuta `select 1`; ambas son operaciones globales justificadas. Login, refresh, logout, comprobación de sesión y `/me` conservan su comportamiento, pero todas las operaciones que ya conocen identidad usan contexto local.

### Regla para tablas futuras

Toda migración que añada una tabla empresarial debe:

1. usar UUID y un `company_id uuid not null` con FK a `companies`;
2. incorporar `company_id` en claves únicas, índices y FKs compuestas que crucen tablas;
3. cambiar el propietario a `factupapa_migrator` y conceder solo las operaciones necesarias a `factupapa_api`;
4. activar y forzar RLS;
5. crear una política con `USING` y `WITH CHECK` contra `app.current_company_id` y, si procede, `app.current_user_id`;
6. acceder desde la API exclusivamente mediante `withTenantTransaction`;
7. añadir pruebas negativas con dos empresas para `SELECT`, `INSERT`, `UPDATE` y `DELETE`.

No se aprobará un endpoint económico que consulte el pool directamente.

## Bloque de ventas

Albaranes, facturas, líneas, numeración y conversión usan `withTenantTransaction`. `0006_sales_documents.sql` aplica RLS forzado; los snapshots impiden que cambios posteriores reescriban documentos. El PDF se genera al vuelo y MinIO no se expone. Véanse [SALES_DOMAIN.md](SALES_DOMAIN.md) y [SECURITY.md](SECURITY.md).
