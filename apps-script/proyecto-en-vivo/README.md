# Backup del proyecto Apps Script EN PRODUCCIÓN

Copia fiel del proyecto **Gonsol Drive Organizer** que corre de verdad
(Script ID `1xDcvGjw35W-Vmly74nWloNtV0q0sbRhke47b4OlxgQ2qmkl2JAm3ZDo5`),
obtenida con `clasp clone` el 2026-07-09.

**Importante:** esta versión es DISTINTA de `../gonsol-drive-organizer/` (que
tiene importación de Gmail y parsers que aquí no están). Esta es la que está
desplegada y contiene, además del agente OCR de compras:
- `USO_DIARIO.js`: plantillas de entrada manual de compras/ventas/gastos
  (`procesarCompraManual`, `procesarVentaManual`, `procesarGastoManual`).
- `Copia_de_Codigo_gs.js`: copia antigua que había en el proyecto.

## Cambios aplicados el 2026-07-09 (desplegados con `clasp push`)
- `isTotalSane_`: valida el total contra base+IVA; si no cuadra, la factura va a
  REVISAR_MANUALMENTE en vez de registrarse con un total erróneo (bug "0,56 €").
- `extractTotal_`: prefiere el importe que cuadre con base+IVA.
- Proveedor **HIGIENLAB** (NIF `B42743211`, IVA 21%, envases) añadido a `GONSOL_SUPPLIERS`.

## Pendiente (próxima sesión)
- Que `reorganizePurchasesByMonth_` archive por la FECHA de la factura (Drive está
  con los meses mezclados).
- Función nueva para subir a Drive los PDF de las facturas de venta de la app.
