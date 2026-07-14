# FactuPapa Next

Proyecto paralelo e independiente para construir la siguiente generación de FactuPapa sin afectar a la aplicación actual.

## Estado

- Rama de trabajo: `design/factupapa-full-prototype`
- Producción actual: intocable
- Objetivo inmediato: validar importaciones ficticias de catálogo antes de usar datos reales
- Primera beta: uso exclusivo de Nando
- Arquitectura: preparada para evolucionar a producto multiempresa y móvil
- Aislamiento: RLS forzado y validado entre dos empresas con un rol API no propietario

## Principios

1. Ningún cambio de esta carpeta debe modificar el funcionamiento de la aplicación actual.
2. Todo servicio debe poder ejecutarse de forma aislada con Docker.
3. Los datos se almacenan en PostgreSQL y los documentos en almacenamiento S3 compatible.
4. El OCR funciona como proceso separado para no bloquear la aplicación.
5. La aplicación móvil y la aplicación web comparten API y modelos de datos.
6. No se usan credenciales reales dentro del repositorio.
7. Las migraciones hacia FactuPapa Next siempre son copiadas y reversibles; nunca destructivas.

## Estructura actual y prevista

```text
factupapa-next/
├── apps/
│   ├── api/          API central mínima (actual)
│   ├── web/          panel web y PWA (futuro)
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
- API TypeScript: healthcheck, autenticación, contactos, productos, precios específicos e importaciones validadas.
- Migrador: aplica y registra cambios de esquema con credenciales administrativas aisladas de la API.
- Provisionador: asigna en cada arranque la contraseña local al rol limitado `factupapa_api`.
- Worker: previsto para trabajos asíncronos; todavía no implementado.

## Primer arranque técnico

1. Entrar en `factupapa-next/infrastructure`.
2. Copiar `.env.example` a `.env`.
3. Sustituir todas las cadenas `CAMBIAR_...`. `DATABASE_ADMIN_URL` usa `POSTGRES_PASSWORD`; `DATABASE_URL` usa la contraseña distinta `API_DATABASE_PASSWORD`.
4. Ejecutar `docker compose up --build -d`.
5. Verificar `http://localhost:4100/health` y `http://localhost:4100/ready`.

La API incorpora login por email y contraseña, rotación de refresh tokens, logout y `GET /me`. No existe registro público: el primer usuario y su empresa se crean exclusivamente mediante el comando de bootstrap documentado en la guía de desarrollo.

El primer dominio funcional incluye contactos de tipo cliente, proveedor o ambos; productos con unidades `kg`, `g`, `unit`, `box` y `custom`; y precios vigentes específicos por cliente con fallback automático al precio general. Las bajas son lógicas y todos los cambios se auditan. Los valores monetarios viajan como cadenas decimales y se almacenan como `numeric`, nunca como coma flotante.

La importación admite CSV UTF-8 y JSON estructurado para contactos, productos y precios específicos. Primero crea una previsualización tenant aislada; no modifica el catálogo hasta que el usuario confirma una estrategia de conflicto. Los lotes se pueden cancelar, no se pueden confirmar dos veces y conservan únicamente datos normalizados y diagnósticos, nunca el archivo original completo.

Las consultas autenticadas se ejecutan en una transacción que fija `app.current_company_id` y `app.current_user_id` con alcance local. PostgreSQL aplica RLS incluso al propietario de las tablas; el rol conectado por la API no puede omitir ni desactivar esas políticas.

La guía completa está en [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Las decisiones y límites actuales están en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Este proyecto todavía no está conectado a ningún dato real ni a la aplicación productiva.
