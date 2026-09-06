# FactuPapa Next

Nueva generación de FactuPapa, desarrollada de forma aislada para no afectar a la aplicación anterior ni a producción.

## Estado actual

- Rama activa de continuidad: `codex/factupapa-next-quality-sweep`.
- Producción: fuera de alcance e intocable.
- Staging: entorno privado con datos exclusivamente ficticios.
- Objetivo: candidata beta móvil para uso interno de Nando.
- Arquitectura: API TypeScript, PWA React/Vite, PostgreSQL con RLS forzado, Redis y almacenamiento S3 compatible.
- Aislamiento: separación por empresa validada con un rol API no propietario.
- Migración aditiva documentada más reciente: `0016_beta_operations.sql`.

## Principios

1. Ningún cambio dentro de `factupapa-next/` debe modificar la FactuPapa antigua.
2. Todo servicio debe poder ejecutarse de forma aislada mediante Docker.
3. Los datos económicos y operativos se almacenan en PostgreSQL; los documentos se archivan en almacenamiento S3 compatible.
4. FactuPapa no incorpora cámara, escáner, Anthropic, Tesseract ni OCR.
5. Las compras llegan mediante alta manual o sincronización externa Drive → agente → Google Sheets.
6. Los justificantes se conservan como adjuntos originales; la aplicación no interpreta su contenido.
7. La aplicación web y cualquier cliente móvil futuro deben compartir API y modelos de dominio.
8. No se usan credenciales, NIF ni datos reales dentro del repositorio.
9. Las migraciones son únicamente aditivas; las migraciones existentes no se modifican.

## Estructura

```text
factupapa-next/
├── apps/
│   ├── api/          API TypeScript
│   ├── web/          PWA React/Vite mobile-first
│   ├── mobile/       reservado para un cliente móvil futuro
│   └── worker/       reservado para procesos asíncronos futuros
├── packages/
│   ├── database/     esquema y migraciones
│   ├── contracts/    tipos compartidos
│   └── ui/           sistema visual compartido
├── infrastructure/   Docker, proxy, copias y despliegue
└── docs/             arquitectura, seguridad y operación
```

## Servicios

- PostgreSQL: datos económicos y operativos.
- MinIO: facturas, justificantes, PDF e imágenes.
- Redis: coordinación operativa.
- API TypeScript: autenticación, contactos, productos, importaciones, facturas, compras, stock, pagos y PDF.
- Web React/TypeScript: PWA móvil principal.
- Migrador: aplica cambios de esquema con credenciales administrativas aisladas de la API.
- Provisionador: configura el rol limitado `factupapa_api`.

## Primer arranque técnico

1. Entrar en `factupapa-next/infrastructure`.
2. Copiar `.env.example` a `.env`.
3. Sustituir las cadenas `CAMBIAR_...` con valores locales ficticios. `DATABASE_ADMIN_URL` usa `POSTGRES_PASSWORD`; `DATABASE_URL` usa `API_DATABASE_PASSWORD`.
4. Ejecutar `docker compose up --build -d`.
5. Verificar `http://127.0.0.1:4100/health`, `http://127.0.0.1:4100/ready` y `http://127.0.0.1:4173`.

## Aplicación web

`apps/web` usa React, TypeScript, Vite, React Router, TanStack Query, React Hook Form y Zod. La navegación móvil objetivo es Inicio, Facturas, Gastos, Productos y Otros. La factura directa es el flujo principal; los albaranes no deben ocupar una posición protagonista cuando no se utilizan.

Los importes se presentan con formato español legible, mientras que la API transporta decimales como cadenas y PostgreSQL conserva la precisión mediante `numeric`.

La PWA dispone de manifest, iconos, service worker y shell offline. Los datos autenticados de la API no se cachean en el service worker. La URL se configura con `VITE_API_BASE_URL`; no se incluyen URLs privadas ni secretos en el bundle.

El access token permanece solo en memoria. El refresh token rotatorio se entrega mediante cookie `HttpOnly`, `SameSite=Strict`, con `Secure` configurable y ruta `/auth`. No existe registro público; el primer usuario y su empresa se crean con el procedimiento de bootstrap documentado.

## Dominio funcional

FactuPapa incluye contactos de tipo cliente, proveedor o ambos; productos con unidades comerciales configurables; precios generales y precios específicos por cliente; facturas directas; periodos quincenales; condiciones de pago opcionales; cobros parciales; deuda y vencimientos; compras; pagos a proveedores; producción; merma; stock y costes.

Los datos comerciales necesarios quedan congelados en las líneas de los documentos emitidos. Los borradores de factura se conservan por usuario y empresa para reducir pérdidas de trabajo ante cortes de cobertura.

Las compras pueden crearse manualmente o sincronizarse de forma idempotente desde el registro externo Drive → agente → Google Sheets, conservando el enlace al documento original. Los justificantes son archivos archivados, no entradas para un sistema OCR.

La importación de contactos, productos y precios exige previsualización, validación y una estrategia explícita de conflictos antes de escribir. El frontend incluye soporte técnico para leer archivos Excel compatibles; debe considerarse funcional únicamente cuando el recorrido completo de importación y sus pruebas lo confirmen.

VERI*FACTU, facturas rectificativas y factura electrónica legal están expresamente fuera de esta fase.

## Seguridad y aislamiento

Las consultas autenticadas se ejecutan en transacciones que fijan `app.current_company_id` y `app.current_user_id` con alcance local. PostgreSQL aplica RLS forzado y el rol de la API no puede omitir ni desactivar esas políticas.

No se deben publicar secretos, datos reales, trazas autenticadas ni artifacts con información privada.

## Operación y documentación

Los comandos operativos principales de la API incluyen `config:check`, `backup:database`, `restore:verify`, `backup:objects`, `cleanup:imports` y `recovery:full`.

Consulte:

- [DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [SECURITY.md](docs/SECURITY.md)
- [OPERATIONS.md](docs/OPERATIONS.md)
- [BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md)
- [DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md)
- [IMPORT_MAPPING.md](docs/IMPORT_MAPPING.md)
- [SALES_DOMAIN.md](docs/SALES_DOMAIN.md)
- [E2E_TESTING.md](docs/E2E_TESTING.md)

El proyecto no está conectado a producción ni a datos reales.
