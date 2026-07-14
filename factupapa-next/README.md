# FactuPapa Next

Proyecto paralelo e independiente para construir la siguiente generación de FactuPapa sin afectar a la aplicación actual.

## Estado

- Rama de trabajo: `design/factupapa-full-prototype`
- Producción actual: intocable
- Objetivo inmediato: infraestructura local/autohospedada, núcleo de facturación y almacenamiento documental propio
- Primera beta: uso exclusivo de Nando
- Arquitectura: preparada para evolucionar a producto multiempresa y móvil

## Principios

1. Ningún cambio de esta carpeta debe modificar el funcionamiento de la aplicación actual.
2. Todo servicio debe poder ejecutarse de forma aislada con Docker.
3. Los datos se almacenan en PostgreSQL y los documentos en almacenamiento S3 compatible.
4. El OCR funciona como proceso separado para no bloquear la aplicación.
5. La aplicación móvil y la aplicación web comparten API y modelos de datos.
6. No se usan credenciales reales dentro del repositorio.
7. Las migraciones hacia FactuPapa Next siempre son copiadas y reversibles; nunca destructivas.

## Estructura prevista

```text
factupapa-next/
├── apps/
│   ├── api/          API central
│   ├── web/          panel web y PWA
│   ├── mobile/       aplicación iOS/Android futura
│   └── worker/       OCR y procesos en segundo plano
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
- API TypeScript: autenticación, facturas, clientes, compras y documentos.
- Worker OCR: extracción de proveedor, NIF, fecha, base, IVA y total.

## Primer arranque técnico

1. Copiar `.env.example` a `.env`.
2. Sustituir las contraseñas de ejemplo.
3. Ejecutar `docker compose up -d` dentro de `infrastructure`.
4. Comprobar PostgreSQL, Redis y MinIO.
5. Levantar la API y verificar `/health`.

Este proyecto todavía no está conectado a ningún dato real ni a la aplicación productiva.
