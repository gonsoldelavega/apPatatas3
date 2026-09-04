---
description: Auditoría completa y solo lectura de la integridad de datos de Factupapa
---

# Revisar integridad de datos

Este workflow es **SOLO LECTURA**. Sigue `AGENTS.md` y no crea puertas de aprobación adicionales.

Encontrar un problema **no es motivo para detener la auditoría**. Continúa todas las comprobaciones seguras, reúne evidencia suficiente y entrega el informe completo antes de proponer cambios.

Cualquier mutación real de facturas, compras, gastos, filas del registro u otros datos de negocio queda fuera de este workflow y debe respetar las puertas de aprobación de `AGENTS.md`.

## Token secreto

El estado de nube requiere `APP_SYNC_TOKEN`.

- Lee `APP_SYNC_TOKEN` de la variable de entorno si existe.
- Nunca lo escribas en archivos, logs persistentes, commits o documentación del repositorio público.
- Si este workflow fue solicitado explícitamente y el token es imprescindible pero no está disponible, pídelo **una sola vez** y úsalo únicamente para la ejecución necesaria.
- Si esta auditoría era solo un chequeo proactivo opcional dentro de una tarea que no depende de datos, no bloquees la tarea por falta de token: omite el chequeo opcional y menciónalo al final.
- Si la API responde `unauthorized`, comprueba primero que se usó la variable correcta; si realmente falta un token válido y la auditoría depende de él, solicita uno nuevo una sola vez.

## 1. Obtén las fuentes sin modificarlas

### Nube

Descarga el estado con una petición autenticada a:

`https://ap-patatas3.vercel.app/api/app-state`

Guarda cualquier copia temporal fuera del repositorio, por ejemplo `/tmp/cloud.json`.

### Registro maestro

Descarga `REGISTRO` desde Google Sheets en modo lectura y guarda la copia temporal fuera del repositorio, por ejemplo `/tmp/reg.csv`.

### Gmail

Si el conector de Gmail está disponible y el alcance de la auditoría lo justifica, busca en modo lectura las facturas relevantes que deban existir en `REGISTRO`.

No archives, etiquetes, borres ni muevas mensajes durante esta auditoría.

## 2. Audita facturas de venta

En `cloud.json -> state.invoices` comprueba como mínimo:

- IDs duplicados;
- mismo número `FAC-###/AÑO` asociado a IDs diferentes;
- huecos de numeración, distinguiendo huecos legítimos/explicables de anomalías;
- fechas/años incompatibles con la numeración cuando sea detectable;
- cualquier patrón que sugiera una factura fantasma o una sobrescritura.

Los duplicados reales de ID o número deben marcarse como **Grave**.

No concluyas que un hueco es un error solo por existir: aporta contexto/evidencia.

## 3. Audita compras del REGISTRO

Columnas históricamente usadas:

- 0 fecha
- 2 tipo
- 5 proveedor
- 6 NIF
- 7 concepto
- 12 total
- 20 revisado

Antes de confiar ciegamente en índices fijos, valida cabeceras/estructura si el CSV actual permite hacerlo.

Comprueba:

- `Revisado = no` o equivalente;
- total vacío/inválido;
- proveedor vacío o contaminado con texto legal como `inscrita`, `registro mercantil`, `tomo`, `folio`;
- nombre canónico inconsistente para NIF conocidos:
  - `A04037677` -> FRUTAS Y PATATAS GAYCA, S.A.
  - `B04854154` -> J. EXPÓSITO CAZORLA E HIJOS, S.L.
  - `B42743211` -> HIGIENLAB 2020 S.L.
- posibles duplicados por proveedor/NIF + total + número de factura cuando exista + fecha igual o cercana;
- compras asignadas al mes equivocado;
- entradas que parezcan ventas, justificantes bancarios u otros documentos mal clasificados como compra.

Una coincidencia heurística es una **sospecha**, no una autorización para borrar nada.

## 4. Cruza Gmail cuando esté disponible

Busca especialmente facturas de proveedores conocidos, incluyendo GAYCA y Solred/Repsol, que deberían aparecer en el registro.

Para cada posible falta:

- identifica mensaje/documento y fecha;
- extrae proveedor, número de factura y total cuando sea posible;
- busca coincidencia en `REGISTRO` por varias claves, no solo por nombre;
- distingue `falta confirmada`, `posible falta` y `ya registrada con datos distintos`.

No cambies etiquetas ni reimportes automáticamente durante este workflow.

## 5. No pares en el primer hallazgo

Completa todas las áreas aplicables antes del informe final.

Si una fuente falla pero las demás están disponibles:

- continúa con las demás;
- intenta diagnosticar/reintentar fallos recuperables;
- indica exactamente qué parte quedó sin verificar.

## 6. Informe final

Agrupa por severidad:

### Grave

Problemas con alta probabilidad de afectar integridad, duplicidad, numeración o importes.

### Revisar

Anomalías heurísticas o datos incompletos que necesitan confirmación humana/evidencia adicional.

### OK

Comprobaciones relevantes que no muestran problemas.

Para cada hallazgo incluye:

- evidencia suficiente para identificarlo;
- por qué importa;
- acción recomendada concreta;
- si esa acción modificaría datos y, por tanto, requiere aprobación.

Agrupa todas las reparaciones propuestas al final para que, si hace falta autorización, pueda pedirse **una sola vez** con un conjunto concreto y revisable.

Si no hay incidencias, dilo claramente en una línea y resume qué fuentes fueron verificadas.

## Salvaguarda de escritura

Este workflow nunca aplica por sí mismo `borrar fila duplicada`, `corregir proveedor`, `renumerar`, `reimportar`, `mover archivo` ni acciones equivalentes.

Primero termina la auditoría. Después, cualquier reparación de datos debe seguir la política de aprobación de `AGENTS.md`.
