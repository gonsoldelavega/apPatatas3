# Copias y restauración verificable

## Alcance y objetivos provisionales

Estas herramientas se usan solo de forma explícita y con datos ficticios hasta autorizar la beta. El RPO provisional es 24 horas y el RTO provisional es 4 horas. No constituyen todavía una garantía contractual.

## PostgreSQL

Desde `factupapa-next/apps/api`, con el Compose aislado levantado:

```bash
BACKUP_ENVIRONMENT=integration \
BACKUP_DIRECTORY=/ruta/privada \
npm run backup:database
```

`pg_dump` genera formato custom comprimido. El nombre contiene UTC, entorno, última migración e identificador aleatorio. El dump se crea con modo `0600` dentro de un directorio `0700`; se valida con `pg_restore --list` antes de renombrarlo. El manifiesto separado incluye fecha, esquema, tamaño, SHA-256, base, versión de PostgreSQL y última migración aplicada.

`BACKUP_MAX_COPIES` y `BACKUP_MAX_AGE_DAYS` controlan la rotación. `--rotation-dry-run` informa sin borrar. La rotación empieza únicamente después de crear y verificar la copia nueva.

## Verificación de restauración

```bash
RESTORE_DUMP=/ruta/copia.dump \
RESTORE_ENVIRONMENT=integration \
RESTORE_TARGET=ensayo-01 \
npm run restore:verify -- --confirm-isolated-restore
```

Se rechazan producción, nombres no seguros, falta de confirmación, tamaño distinto y checksum manipulado. Se valida el catálogo custom, se restaura a una base temporal nueva, se comprueban migración, tablas básicas, conteos por tenant, `FORCE RLS` y que `factupapa_api` no tenga `BYPASSRLS`. Siempre se elimina la base temporal y se escribe un informe `0600` si todo termina correctamente. Ninguna URL o contraseña se imprime.

## Objetos MinIO

`npm run backup:objects` inventaría buckets y exporta metadatos, contenido y SHA-256 a un directorio privado. Cada objeto se restaura a un bucket temporal aleatorio, se vuelve a leer, se compara por tamaño y checksum y finalmente se elimina. MinIO solo se publica en localhost y la PWA nunca recibe sus credenciales.

## Custodia pendiente

Antes de datos reales faltan almacenamiento cifrado externo al VPS, política de llaves, copia fuera de zona, alertas, calendario aprobado, pruebas periódicas registradas y definición contractual de RPO/RTO.
