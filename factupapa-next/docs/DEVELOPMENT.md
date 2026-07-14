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

2. Cambiar todas las cadenas `CAMBIAR_...`. La contraseña incluida en `DATABASE_URL` debe coincidir con `POSTGRES_PASSWORD`; si contiene caracteres reservados de URL, deben codificarse.

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

   Respuestas esperadas: `/health` devuelve `status: ok`, `/ready` devuelve `status: ready` y PostgreSQL lista `0000_extensions.sql` y `0001_initial.sql`.

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

Con PostgreSQL disponible y `DATABASE_URL` definida:

```bash
cd factupapa-next/apps/api
npm ci
npm run migrate
npm run dev
```

## Pruebas y controles

```bash
cd factupapa-next/apps/api
npm ci
npm run typecheck
npm test
npm run build
```

Las pruebas básicas cubren la configuración, el healthcheck, la disponibilidad con PostgreSQL conectado o caído, las rutas inexistentes y la compatibilidad del migrador con los SQL iniciales. La prueba completa de migraciones requiere Docker/PostgreSQL; se verifica con la consulta a `schema_migrations` indicada arriba.

Antes de entregar cambios, ejecutar también desde la raíz:

```bash
git diff --check
git status --short --branch
```

## Límites del entorno

Este Compose es exclusivamente de desarrollo. No debe desplegarse como producción ni exponerse directamente a Internet. No usa datos reales y el archivo `.env` queda ignorado por Git.
