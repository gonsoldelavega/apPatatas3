# Desarrollo local y verificación

## Requisitos

- Docker Engine con Docker Compose v2 para ejecutar el sistema completo.
- Node.js 22 o superior y npm para trabajar con la API fuera de Docker.

Todos los comandos se ejecutan desde la raíz del repositorio salvo que se indique lo contrario.

## Arranque completo con Docker

1. Crear la configuración local:

   ```bash
   cd factupapa-next/infrastructure
   cp .env.example .env
   ```

   En PowerShell puede usarse `Copy-Item .env.example .env`.

2. Cambiar todas las cadenas `CAMBIAR_...`. `DATABASE_ADMIN_URL` debe usar `POSTGRES_PASSWORD`; `DATABASE_URL` debe usar la credencial distinta `API_DATABASE_PASSWORD`. Si contienen caracteres reservados de URL, deben codificarse.

3. Validar y arrancar:

   ```bash
   docker compose config --quiet
   docker compose up --build -d
   docker compose ps
   ```

4. Verificar la API y PostgreSQL:

   ```bash
   curl http://localhost:4100/health
   curl http://localhost:4100/ready
   docker compose exec postgres psql -U factupapa -d factupapa_next -c "select filename, applied_at from schema_migrations order by filename;"
   ```

   Respuestas esperadas: `/health` devuelve `status: ok`, `/ready` devuelve `status: ready` y PostgreSQL lista las migraciones `0000` a `0004`.

5. Revisar logs si algún servicio no está sano:

   ```bash
   docker compose logs migrate api postgres
   ```

6. Detener sin borrar datos:

   ```bash
   docker compose down
   ```

   `docker compose down -v` borra los volúmenes de desarrollo y todos sus datos; úsese solo cuando se quiera reiniciar expresamente el entorno local.

## API fuera de Docker

Con PostgreSQL disponible, `DATABASE_URL` debe pertenecer a `factupapa_api`. Las migraciones y el bootstrap usan por separado `DATABASE_ADMIN_URL`:

```bash
cd factupapa-next/apps/api
npm ci
npm run migrate
npm run dev
```

## Bootstrap del primer usuario

No existe registro público ni usuario predeterminado. El bootstrap solo funciona si no hay ninguna empresa ni usuario y nunca actualiza una contraseña existente.

Con el entorno Docker levantado, suministrar los valores mediante variables de la sesión actual. La contraseña se lee sin eco y no forma parte del comando ni del historial:

```bash
cd factupapa-next/infrastructure
read -r -p "Empresa: " BOOTSTRAP_COMPANY_NAME
read -r -p "Email: " BOOTSTRAP_USER_EMAIL
read -r -p "Nombre visible: " BOOTSTRAP_USER_NAME
read -r -s -p "Contraseña inicial: " BOOTSTRAP_USER_PASSWORD && printf '\n'
export BOOTSTRAP_COMPANY_NAME BOOTSTRAP_USER_EMAIL BOOTSTRAP_USER_NAME BOOTSTRAP_USER_PASSWORD
cleanup_bootstrap_env() {
  unset BOOTSTRAP_COMPANY_NAME BOOTSTRAP_USER_EMAIL BOOTSTRAP_USER_NAME BOOTSTRAP_USER_PASSWORD
}
trap cleanup_bootstrap_env EXIT

docker compose run --rm \
  -e BOOTSTRAP_COMPANY_NAME \
  -e BOOTSTRAP_USER_EMAIL \
  -e BOOTSTRAP_USER_NAME \
  -e BOOTSTRAP_USER_PASSWORD \
  bootstrap

cleanup_bootstrap_env
trap - EXIT
```

La contraseña debe tener entre 14 y 128 caracteres. El comando solo informa de éxito o error y no imprime email, contraseña, hash ni tokens.

El bootstrap es una excepción administrativa explícita a RLS y solo debe ejecutarse desde un entorno controlado con `DATABASE_ADMIN_URL`; esa variable nunca se entrega al contenedor `api`.

## API de autenticación

- `POST /auth/login` con `email` y `password`.
- `POST /auth/refresh` con `refreshToken`.
- `POST /auth/logout` con Bearer access token y `refreshToken`.
- `GET /me` con Bearer access token.

Los clientes deben mantener access y refresh tokens en almacenamiento seguro del sistema operativo. No deben guardarlos en logs, analítica ni URLs.

## API de contactos, productos y precios

Todos estos endpoints exigen Bearer access token:

- `POST /contacts`, `GET /contacts`, `GET /contacts/:id`, `PATCH /contacts/:id`, `DELETE /contacts/:id`.
- `POST /products`, `GET /products`, `GET /products/:id`, `PATCH /products/:id`, `DELETE /products/:id`.
- `PUT` y `DELETE /contacts/:contactId/products/:productId/price`.
- `GET /contacts/:contactId/products` para catálogo con precio efectivo.

Los listados aceptan `page`, `pageSize` —máximo 100—, `search`, `sort`, `order` e `isActive`; contactos también acepta `type`. El orden siempre usa `id` como desempate.

Ejemplo ficticio de contacto:

```json
{
  "type": "both",
  "legalName": "Empresa de ejemplo",
  "taxId": "TEST-B-0001",
  "email": "contacto@example.test",
  "phone": "+34 600 000 000",
  "address": { "city": "Madrid", "country": "ES" },
  "notes": "Dato ficticio para desarrollo"
}
```

Ejemplo ficticio de producto y precio:

```json
{
  "name": "Producto de ejemplo",
  "sku": "TEST-SKU-001",
  "unit": "kg",
  "salePrice": "12.3400",
  "estimatedCost": "8.1100",
  "taxRate": "4"
}
```

```json
{ "price": "9.8765", "validFrom": "2026-07-14", "isActive": true }
```

Los importes deben enviarse como cadenas decimales. `DELETE` realiza baja lógica y devuelve `204`; un UUID inexistente o perteneciente a otra empresa devuelve el mismo `404`. `company_id` nunca forma parte del contrato de entrada y cualquier clave desconocida provoca `400`.

## API de importaciones

Todos los endpoints exigen Bearer access token:

- `POST /imports/validate`: parsea, normaliza y crea una previsualización sin modificar el catálogo.
- `GET /imports?page=1&pageSize=25`: lista lotes de la empresa autenticada.
- `GET /imports/:id`: devuelve resumen, errores, warnings, acciones y una muestra limitada.
- `POST /imports/:id/confirm`: confirma con una estrategia explícita.
- `POST /imports/:id/cancel`: cancela un lote pendiente o validado; el cuerpo es `{}`.

La petición de validación usa `entityType` (`contacts`, `products` o `contact_product_prices`), `sourceFormat` (`csv` o `json`) y exactamente uno de `content` o `contentBase64`. Base64 existe para transportar bytes y poder rechazar UTF-8 inválido; no cambia el formato declarado. Ejemplo ficticio:

```json
{
  "entityType": "products",
  "sourceFormat": "json",
  "content": "[{\"name\":\"Producto ficticio\",\"sku\":\"TEST-IMPORT-001\",\"unit\":\"kg\",\"salePrice\":\"12.3456\",\"taxRate\":\"4\"}]"
}
```

La confirmación usa una de estas estrategias:

```json
{ "strategy": "skip_existing" }
```

- `skip_existing`: crea filas nuevas y omite coincidencias existentes.
- `update_existing`: crea nuevas y sobrescribe coincidencias identificadas por NIF o SKU con los valores normalizados del lote.
- `fail_on_conflict`: no escribe nada si existe una posible actualización.

Un lote con filas `duplicate`, `conflict` o `error` no se puede confirmar. La respuesta de validación distingue filas nuevas, posibles actualizaciones, duplicados internos, conflictos y errores; incluye una muestra limitada, no el archivo original. Repetir exactamente contenido, entidad y formato reutiliza el lote vigente mediante su checksum. Un lote completado o en curso no genera una segunda importación, y `FOR UPDATE` impide confirmaciones simultáneas.

### Plantillas CSV UTF-8

Las cabeceras son exactas, sensibles a guiones bajos y no admiten columnas desconocidas:

```csv
type,legal_name,trade_name,tax_id,email,phone,address_street,address_line2,postal_code,city,province,country,notes,is_active
customer,Cliente ficticio,,TEST-C-001,cliente@example.test,+34600000000,Calle de prueba 1,,28000,Madrid,Madrid,ES,Dato ficticio,true
```

```csv
name,description,sku,unit,sale_price,estimated_cost,tax_rate,is_active
Producto ficticio,Dato ficticio,TEST-P-001,kg,12.3456,8.0001,4,true
```

```csv
tax_id,sku,price,valid_from,is_active
TEST-C-001,TEST-P-001,9.8765,2026-07-15,true
```

En JSON se usan los nombres camelCase de la API: `legalName`, `tradeName`, `taxId`, `salePrice`, `estimatedCost`, `taxRate` y `validFrom`. La dirección es el mismo objeto estructurado de `/contacts`. Las unidades válidas son `kg`, `g`, `unit`, `box` y `custom`. Precios, costes e impuestos deben ser strings decimales; los números JSON se rechazan para impedir coma flotante binaria.

### Límites y prueba manual

Los valores predeterminados son 1 MiB, 1.000 filas y 50 filas de muestra. Se configuran mediante `IMPORT_MAX_BYTES`, `IMPORT_MAX_ROWS` e `IMPORT_PREVIEW_ROWS`. El límite HTTP incluye un margen exclusivamente para el sobre JSON/base64; el contenido decodificado vuelve a comprobarse contra `IMPORT_MAX_BYTES`.

Procedimiento manual en un entorno vacío y ficticio:

1. autenticar un usuario de pruebas y conservar el access token fuera de logs y URLs;
2. enviar una plantilla a `/imports/validate` y comprobar que el catálogo no cambia;
3. revisar resumen, errores, warnings y acciones propuestas en `/imports/:id`;
4. confirmar con `fail_on_conflict` para altas nuevas o elegir conscientemente otra estrategia;
5. verificar catálogo y eventos `import.validated`/`import.confirmed`;
6. repetir el mismo contenido y comprobar que retorna el mismo lote y que una nueva confirmación responde `409`;
7. crear otro lote y cancelarlo, comprobando que ya no puede confirmarse.

Antes de importar datos reales siguen pendientes una interfaz móvil de mapeo/revisión, plantillas validadas con copias anonimizadas, política de retención/borrado de filas temporales, exportación neutralizada, copia/restauración, métricas y autorización operativa expresa. Excel no está implementado. No debe ampliarse `IMPORT_MAX_BYTES` o `IMPORT_MAX_ROWS` sin medir memoria y duración transaccional.

## Pruebas y controles

```bash
cd factupapa-next/apps/api
npm ci
npm run typecheck
npm test
npm run build
```

Con PostgreSQL migrado disponible y ambas URLs separadas:

```bash
npm run test:integration
```

Las pruebas unitarias cubren configuración, healthchecks, contexto/rollback transaccional, validación de dominio, precisión decimal, Argon2id, firma de tokens, rate limiting, migraciones, CSV/JSON, UTF-8, binarios, límites y neutralización de fórmulas. La integración PostgreSQL cubre autenticación, CRUD, importación por estrategias, checksum, cancelación, doble confirmación, rollback integral, precios exactos, auditoría y aislamiento RLS entre dos empresas.

## Verificación manual de RLS

Con Compose levantado, obtener únicamente para esta sesión los UUID ficticios creados en un entorno de prueba. Conectar como `factupapa_api`, iniciar una transacción y fijar contexto local:

```sql
begin;
select set_config('app.current_company_id', '<UUID_EMPRESA_A>', true);
select set_config('app.current_user_id', '<UUID_USUARIO_A>', true);
select id, company_id from contacts;
select id, company_id from contacts where company_id = '<UUID_EMPRESA_B>';
rollback;
```

La primera consulta solo puede mostrar la empresa A y la segunda debe devolver cero filas. Dentro de otra transacción con contexto A, este intento debe fallar con una violación de RLS:

```sql
insert into contacts(company_id, kind, legal_name)
values ('<UUID_EMPRESA_B>', 'customer', 'Prueba bloqueada');
```

Confirmar además el rol real:

```sql
select current_user, rolsuper, rolbypassrls
from pg_roles where rolname = current_user;
```

Debe devolver `factupapa_api`, `false`, `false`. `alter table contacts disable row level security` debe ser rechazado por falta de propiedad. Sin `BEGIN` y `set_config(..., true)`, `select * from contacts` debe devolver cero filas.

Antes de entregar cambios, ejecutar también desde la raíz:

```bash
git diff --check
git status --short --branch
```

## Límites del entorno

Este Compose es exclusivamente de desarrollo. No debe desplegarse como producción ni exponerse directamente a Internet. No usa datos reales y el archivo `.env` queda ignorado por Git.
