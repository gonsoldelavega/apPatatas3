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

Las pruebas unitarias cubren configuración, healthchecks, contexto/rollback transaccional, validación de dominio, precisión decimal, Argon2id, firma de tokens, rate limiting y migraciones. La integración PostgreSQL cubre autenticación, CRUD, conflictos, búsqueda, paginación, bajas lógicas, precios efectivos, auditoría y aislamiento RLS entre dos empresas.

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
