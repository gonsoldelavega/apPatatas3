---
description: Chequeo de salud de los datos (nube + Google Sheet): duplicados, numeración, proveedores y compras que faltan
---

Revisa la integridad de los datos de Factupapa y devuelve un informe. Es SOLO LECTURA: no modifiques nada; si detectas algo que arreglar, propón la acción y espera confirmación.

## Token (secreto)
Necesitas el token de sincronización (`APP_SYNC_TOKEN`). **Es secreto: NO lo escribas en ningún archivo ni lo commitees** (el repo es público). Léelo de la variable de entorno `APP_SYNC_TOKEN` si existe; si no, pídeselo al usuario y úsalo solo en memoria para esta ejecución.

## Pasos

1. **Descarga el estado de la nube**:
   `curl -s -H "x-sync-token: $TOKEN" https://ap-patatas3.vercel.app/api/app-state -o /tmp/cloud.json`
   (si responde `unauthorized`, el token es incorrecto → pídelo de nuevo.)

2. **Descarga el REGISTRO (Google Sheet)**:
   `curl -s -L "https://docs.google.com/spreadsheets/d/1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU/gviz/tq?tqx=out:csv&sheet=REGISTRO" -o /tmp/reg.csv`

3. **Analiza con python y reporta** (agrupa por severidad):

   **FACTURAS** (`cloud.json` → `state.invoices`):
   - Duplicados por `id` (la misma factura dos veces) → **grave** (fue el bug de la 122 fantasma).
   - Mismo número `FAC-###/AÑO` en dos `id` distintos → **grave**.
   - Huecos en la secuencia de números.

   **COMPRAS** (`reg.csv`; columnas: 0 fecha, 2 tipo, 5 proveedor, 6 NIF, 7 concepto, 12 total, 20 revisado):
   - Filas con `Revisado` = `no` (pendientes de revisión manual) o sin total.
   - Proveedor "basura": vacío o con texto legal ("inscrita", "registro mercantil", "tomo", "folio").
   - Proveedores conocidos por NIF con nombre distinto al canónico:
     `A04037677` → FRUTAS Y PATATAS GAYCA, S.A. · `B04854154` → J. EXPÓSITO CAZORLA E HIJOS, S.L. · `B42743211` → HIGIENLAB 2020 S.L.
   - Posibles duplicados: mismo total + mismo proveedor + fechas iguales/cercanas.

   **GMAIL** (si el conector de Gmail está disponible en la sesión):
   - Facturas de GAYCA (`gayca@frutasypatatasgayca.com`) y Solred (`facturaelectronicasolred@...repsol.com`) en el correo que NO aparezcan en el REGISTRO.

4. **Informe final**: lista concisa por severidad (Grave / Revisar / OK), y para cada hallazgo la acción recomendada (p.ej. "borrar fila duplicada", "corregir proveedor a X"). Si no hay nada, dilo en una línea. No cambies nada sin que el usuario lo confirme.
