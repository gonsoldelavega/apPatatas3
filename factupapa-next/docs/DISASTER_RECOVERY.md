# Recuperación ante desastre

## Ensayo automatizado

`npm run recovery:full` solo acepta un `COMPOSE_PROJECT_NAME` que identifique CI, test o recovery, rechaza producción y exige credenciales ficticias. El ensayo:

1. levanta Compose rootless y aplica migraciones;
2. crea empresa, sesión, contactos, productos, albarán y factura ficticios;
3. emite documentos, genera PDF y crea/valida backup;
4. verifica restauración temporal;
5. destruye servicios y volúmenes del proyecto aislado;
6. recrea roles, restaura la copia y ejecuta el migrador;
7. compara empresas, catálogo, documentos, secuencias y auditoría;
8. comprueba autenticación, PDF regenerable, RLS e inmutabilidad;
9. destruye nuevamente y confirma cero servicios y volúmenes.

Un trap realiza limpieza incluso en fallo. El workflow añade checksum incorrecto, dependencias detenidas/recuperadas, dos backups, dos cleanups y análisis de logs sin secretos.

## Procedimiento humano provisional

Declarar incidente, congelar escrituras, identificar la última copia cuyo dump, manifiesto y checksum estén juntos, copiarla a un entorno aislado y ejecutar `restore:verify`. Solo un responsable autorizado puede decidir una restauración real; esta automatización nunca apunta a producción por defecto. Conservar informe, request IDs y cronología, rotar credenciales potencialmente afectadas y validar tenants antes de reabrir.

## Criterio previo a datos reales

No introducir datos reales hasta completar cifrado y copia externa, responsable de guardia, monitorización persistente, prueba de restauración firmada, capacidad y espacio, política legal de retención, TLS y revisión independiente de seguridad.
