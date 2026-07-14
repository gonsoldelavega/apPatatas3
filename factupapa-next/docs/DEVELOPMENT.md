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

   Respuestas esperadas: `/health` devuelve `status: ok`, `/ready` devuelve `status: ready` y PostgreSQL lista las migraciones `0000`, `0001` y `0002`.

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
  api npm run bootstrap:prod

cleanup_bootstrap_env
trap - EXIT
```

La contraseña debe tener entre 14 y 128 caracteres. El comando solo informa de éxito o error y no imprime email, contraseña, hash ni tokens.

## API de autenticación

- `POST /auth/login` con `email` y `password`.
- `POST /auth/refresh` con `refreshToken`.
- `POST /auth/logout` con Bearer access token y `refreshToken`.
- `GET /me` con Bearer access token.

Los clientes deben mantener access y refresh tokens en almacenamiento seguro del sistema operativo. No deben guardarlos en logs, analítica ni URLs.

## Pruebas y controles

```bash
cd factupapa-next/apps/api
npm ci
npm run typecheck
npm test
npm run build
```

Con PostgreSQL migrado disponible:

```bash
npm run test:integration
```

Las pruebas unitarias cubren configuración, healthchecks, Argon2id, firma de access tokens, generación de refresh tokens, rate limiting y migraciones. La integración PostgreSQL cubre bootstrap, login, errores no enumerables, `/me`, rotación, reutilización, logout y auditoría.

Antes de entregar cambios, ejecutar también desde la raíz:

```bash
git diff --check
git status --short --branch
```

## Límites del entorno

Este Compose es exclusivamente de desarrollo. No debe desplegarse como producción ni exponerse directamente a Internet. No usa datos reales y el archivo `.env` queda ignorado por Git.
