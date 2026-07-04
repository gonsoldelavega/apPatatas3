---
description: Cierre mensual para la gestoría — compila compras, gastos y ventas del mes + borrador de email a Bongest + checklist de adjuntos
---

Prepara la documentación mensual para la gestoría (Bongest). SOLO LECTURA de datos; no modifica nada. El resultado es un resumen + un borrador de email + una checklist.

`$ARGUMENTS` = mes en formato `YYYY-MM` (p.ej. `2026-06`). Si viene vacío, usa el **último mes natural completo**.

## Token (secreto)
Necesitas `APP_SYNC_TOKEN`. **Es secreto: no lo escribas en ningún archivo** (repo público). Léelo de la variable de entorno o pídeselo al usuario; úsalo solo en memoria.

## Pasos

1. **Descarga datos**:
   - Nube: `curl -s -H "x-sync-token: $TOKEN" https://ap-patatas3.vercel.app/api/app-state -o /tmp/cloud.json`
   - Sheet: `curl -s -L "https://docs.google.com/spreadsheets/d/1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU/gviz/tq?tqx=out:csv&sheet=REGISTRO" -o /tmp/reg.csv`

2. **Compila con python** (todo del mes objetivo):
   - **COMPRAS** (reg.csv, filas `tipo=compra` de ese mes): nº de facturas y total. Agrupa por proveedor. Marca las que estén `Revisado=no` como pendientes.
   - **GASTOS** (cloud `state.expenses` de ese mes): cuota de autónomos, gestoría, combustible (Solred) si está. Suma.
   - **VENTAS** (cloud `state.invoices` con `issueDate` de ese mes): nº de facturas y total (IVA incl.).
   - **Cruce con Gmail** (si el conector está disponible): facturas de GAYCA / Solred / Bongest de ese mes que deberían adjuntarse.

3. **Genera un resumen** claro (tabla): ventas, compras (por proveedor), gastos, y total deducible.

4. **Prepara el borrador de email a la gestoría** (`gestion@bongest.es`), respondiendo al hilo de recordatorio del mes si existe. Estructura: "Os adjunto la documentación de <mes>" + lista de ventas / compras / otros gastos con sus totales + pregunta de cierre si hay algún pago pendiente. Si el conector de Gmail permite crear borrador, créalo; si pide aprobación y falla, entrega el texto para copiar/pegar.

5. **Checklist de adjuntos** (qué subir y de dónde):
   - Compras: PDFs en Drive `02_COMPRAS/<año>/T<trimestre>/<mes>`.
   - Facturas que sigan en `REVISAR_MANUALMENTE`: revisar antes de enviar.
   - Ventas: PDF unificado del mes.
   - Autónomos: recibo bancario. Solred: factura del combustible.

6. **Avisa de descuadres**: compras sin revisar, proveedores mal asignados, o facturas del correo que faltan en el registro (reutiliza la lógica de `/revisar-datos`).

No envíes nada tú; el usuario adjunta los PDFs y pulsa enviar.
