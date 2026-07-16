# FactuPapa Next

Proyecto paralelo e independiente para construir la siguiente generación de FactuPapa sin afectar a la aplicación actual.

## Estado

- Rama de trabajo: `design/factupapa-full-prototype`
- Producción actual: intocable
- Objetivo inmediato: validar la primera PWA móvil contra la API y datos exclusivamente ficticios
- Primera beta: uso exclusivo de Nando
- Arquitectura: preparada para evolucionar a producto multiempresa y móvil
- Aislamiento: RLS forzado y validado entre dos empresas con un rol API no propietario
- Preparación beta: backup/restore verificable, observabilidad, retención y mapeo manual, todavía solo con datos ficticios

## Principios

1. Ningún cambio de esta carpeta debe modificar el funcionamiento de la aplicación actual.
2. Todo servicio debe poder ejecutarse de forma aislada con Docker.
3. Los datos se almacenan en PostgreSQL y los documentos en almacenamiento S3 compatible.

## Operación previa a beta

La migración aditiva actual es `0011_company_sales_preferences.sql`; no altera `0000`–`0010`. Los comandos principales de la API son `config:check`, `backup:database`, `restore:verify`, `backup:objects`, `cleanup:imports` y `recovery:full`. Consulte [BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md), [OPERATIONS.md](docs/OPERATIONS.md), [IMPORT_MAPPING.md](docs/IMPORT_MAPPING.md) y [DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md).
4. El OCR funciona como proceso separado para no bloquear la aplicación.
5. La aplicación móvil y la aplicación web comparten API y modelos de datos.
6. No se usan credenciales reales dentro del repositorio.
7. Las migraciones hacia FactuPapa Next siempre son copiadas y reversibles; nunca destructivas.

## Estructura actual y prevista

```text
factupapa-next/
├── apps/
│   ├── api/          API central mínima (actual)
│   ├── web/          PWA React/Vite mobile-first (actual)
│   ├── mobile/       aplicación iOS/Android (futuro)
│   └── worker/       procesos en segundo plano (futuro)
├── packages/
│   ├── database/     esquema y migraciones
│   ├── contracts/    tipos compartidos
│   └── ui/           sistema visual compartido
├── infrastructure/   Docker, proxy, copias y despliegue
└── docs/             decisiones y manuales
```

## Servicios iniciales

- PostgreSQL: datos económicos y operativos.
- MinIO: almacenamiento de facturas, tickets, PDF e imágenes.
- Redis: cola de trabajo para OCR y tareas pesadas.
- API TypeScript: healthcheck, autenticación, catálogo, importaciones, albaranes, facturas y PDF.
- Web React/TypeScript: PWA instalable con login, catálogo, importación supervisada y ventas.
- Migrador: aplica y registra cambios de esquema con credenciales administrativas aisladas de la API.
- Provisionador: asigna en cada arranque la contraseña local al rol limitado `factupapa_api`.
- Worker: previsto para trabajos asíncronos; todavía no implementado.

## Primer arranque técnico

1. Entrar en `factupapa-next/infrastructure`.
2. Copiar `.env.example` a `.env`.
3. Sustituir todas las cadenas `CAMBIAR_...`. `DATABASE_ADMIN_URL` usa `POSTGRES_PASSWORD`; `DATABASE_URL` usa la contraseña distinta `API_DATABASE_PASSWORD`.
4. Ejecutar `docker compose up --build -d`.
5. Verificar `http://127.0.0.1:4100/health`, `http://127.0.0.1:4100/ready` y `http://127.0.0.1:4173`.

## Aplicación web móvil

`apps/web` es la primera interfaz funcional de FactuPapa Next. Usa React, TypeScript, Vite, React Router, TanStack Query, React Hook Form y Zod. La navegación móvil ofrece Inicio, Ventas, Nuevo, Catálogo y Más; Importar vive en Más. La factura directa es el flujo inicial y el inicio puede adaptarse al uso configurado, sin mostrar albaranes como tarea principal cuando no se utilizan. Los importes comerciales se presentan con formato español legible, aunque la API conserva la precisión decimal completa.

La PWA es instalable desde el navegador y dispone de manifest, icono, service worker y shell offline. Los datos de la API no se cachean en el service worker. La URL se configura con `VITE_API_BASE_URL`; no hay URLs privadas ni secretos en el bundle.

El access token permanece solo en memoria. El refresh token rotatorio se entrega exclusivamente como cookie `HttpOnly`, `SameSite=Strict`, con `Secure` configurable y ruta `/auth`; nunca aparece en JSON ni Web Storage. Una renovación concurrente se comparte entre peticiones y las mutaciones no se reenvían automáticamente tras un 401.

La API incorpora login por email y contraseña, rotación de refresh tokens, logout y `GET /me`. No existe registro público: el primer usuario y su empresa se crean exclusivamente mediante el comando de bootstrap documentado en la guía de desarrollo.

El primer dominio funcional incluye contactos de tipo cliente, proveedor o ambos; productos con unidades `kg`, `g`, `unit`, `box` y `custom`; y precios vigentes específicos por cliente con fallback automático al precio general. Las bajas son lógicas y todos los cambios se auditan. Los valores monetarios viajan como cadenas decimales y se almacenan como `numeric`, nunca como coma flotante.

La importación admite CSV UTF-8 y JSON estructurado para contactos, productos y precios específicos. Primero crea una previsualización tenant aislada; no modifica el catálogo hasta que el usuario confirma una estrategia de conflicto. Los lotes se pueden cancelar, no se pueden confirmar dos veces y conservan únicamente datos normalizados y diagnósticos, nunca el archivo original completo.

Las consultas autenticadas se ejecutan en una transacción que fija `app.current_company_id` y `app.current_user_id` con alcance local. PostgreSQL aplica RLS incluso al propietario de las tablas; el rol conectado por la API no puede omitir ni desactivar esas políticas.

La guía completa está en [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Las decisiones y límites actuales están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ventas y sesión endurecida

La PWA incorpora Ventas con borradores de albarán y factura, precio efectivo por cliente, emisión, cancelación y PDF autenticado. Cada empresa configura prefijo, primer número anual, IVA predeterminado y flujo principal; por defecto usa `FAC-100/año`, IVA 4 % y factura directa. La numeración sigue siendo atómica por empresa, tipo y serie. El PDF emitido es A4, blanco y negro y está diseñado para impresión clara. No existen todavía cobros, vencidos automáticos, rectificativas, contabilidad ni VeriFactu.

El refresh token reside exclusivamente en cookie HttpOnly; el frontend conserva el access token solo en memoria. Véanse [SECURITY.md](docs/SECURITY.md), [SALES_DOMAIN.md](docs/SALES_DOMAIN.md) y [E2E_TESTING.md](docs/E2E_TESTING.md).

Este proyecto todavía no está conectado a ningún dato real ni a la aplicación productiva.
