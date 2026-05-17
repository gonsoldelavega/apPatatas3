# Master Purchase Registry Policy

## Decision

El registro maestro de Google Drive/Sheets debe ser la fuente auditable para compras importadas.

La app Appatatas debe reflejar ese registro, no crear una segunda verdad silenciosa.

## Por que no es conflictivo si se controla

- El registro maestro contiene fecha de documento, fecha de registro, proveedor, NIF, concepto, categoria, base, IVA, total, estado, metodo de pago, mes, trimestre, año y enlace Drive.
- La app necesita esos datos para stock, gastos, resumen mensual y consulta movil.
- El conflicto aparece solo si app y hoja editan la misma compra sin prioridad clara.

## Reglas de sincronizacion

- Compras importadas desde registro:
  - `source = google-registro-compras`
  - ID estable por `drive_file_id` si existe.
  - Fallback anti-duplicado por proveedor + numero + fecha + total.
- La hoja manda en campos contables:
  - fecha documento
  - proveedor
  - NIF/CIF
  - numero
  - base
  - IVA
  - total
  - estado
  - metodo pago
  - enlace Drive
- La app puede enriquecer campos operativos:
  - producto vinculado
  - stockLines
  - notas internas de uso movil
  - adjunto local si existe
- La app no debe sobrescribir el registro maestro sin un flujo explicito de exportacion/reconciliacion.

## Reconciliacion recomendada

1. Importar hoja -> app.
2. Detectar compras de app sin `sourceRegistryFileId`.
3. Mostrar bandeja "pendientes de casar con registro".
4. Permitir casar manualmente con una fila del registro.
5. Solo exportar cambios app -> hoja si el usuario pulsa una accion explicita.

## Estado actual

- El importador ya lee columnas A:S del registro.
- Se ajusto el match de proveedor para usar `taxId` ademas de `nif`.
- Se respeta la columna `Estado`.
- Se reforzo anti-duplicado si cambia el enlace Drive.
