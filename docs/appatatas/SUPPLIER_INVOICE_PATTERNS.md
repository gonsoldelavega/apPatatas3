# Supplier Invoice Patterns

## Proveedores principales

### GAYCA

- Nombre habitual: `FRUTAS Y PATATAS GAYCA, S.A.`
- NIF: `A04037677`
- Formato: ticket/factura termica vertical.
- Cliente habitual en factura: `GONZALEZ CABRERA, IRENE`, NIF `45313973V`.
- Numero de factura: empieza por `FV`, por ejemplo `FV006-00000996`.
- Cuidado: en la misma fila puede aparecer el vendedor, por ejemplo `6 - VENTA ALMACEN`; ese `6` no forma parte del numero de factura.
- Producto habitual: casi siempre `PATATAS AGRIA`.
- Columnas de linea:
  - `Descripcion`
  - `Lote`
  - `Unds`
  - `Precio`
  - `Dto`
  - `Importe`
- Totales:
  - `Base Imponible`
  - `%IVA`
  - `Cuota IVA`
  - `TOTAL`
- IVA habitual: `4%`.

Ejemplo analizado:

- Fecha: `2026-05-04`
- Numero: `FV006-00000996`
- Lineas:
  - `PATATAS AGRIA`, cantidad `150`, precio `0.50`, total `75.00`
  - `SANDIA RAYADA`, cantidad `5`, precio `1.50`, total `7.50`
- Base: `82.50`
- IVA: `3.30`
- Total: `85.80`
- Estado visible: `PAGADO`

### FRUTCAYCAZ

- Marca visible: `FRUTCAYCAZ` o `FRUTIGAYCAZ`.
- Razon social: `J. EXPOSITO CAZORLA E HIJOS, S.L.`
- NIF: `B04854154`
- Formato: factura apaisada, a menudo escaneada rotada.
- Numero de factura: numerico, por ejemplo `26004132`.
- Cliente habitual: `GONZALEZ CABRERA IRENE`, NIF `45313973V`.
- Puede aparecer una linea de albaran y debajo el detalle real. No guardar `ALBARAN ...` como producto si existen lineas de producto.
- Columnas de linea:
  - `Codigo`
  - `Descripcion`
  - `Num. Lote`
  - `Plt.`
  - `Caj.`
  - `Und.`
  - `Tot.Unds`
  - `Precio`
  - `IVA`
  - `Total`
- Totales:
  - `Bruto`
  - `Base Imponible`
  - `%IVA`
  - `Importe IVA`
  - `TOTAL FACTURA`
- IVA habitual: `4%`.

Ejemplo analizado:

- Fecha: `2026-05-16`
- Numero: `26004132`
- Lineas:
  - `CEBOLLA PELADA`, cantidad `20`, precio `1.500`, total `30.00`
  - `AJOS PELAOS`, cantidad `4`, precio `4.950`, total `19.80`
  - `LECHUGA B.2UND.LUCAS`, cantidad `8`, precio `1.750`, total `14.00`
- Base: `63.80`
- IVA: `2.55`
- Total: `66.35`

## Regla de confianza

- Si proveedor, numero, fecha y total cuadran: `confidence >= 0.90`.
- Si falta proveedor, numero o total: `pendiente_revision`.
- Si `base + iva` no cuadra con total: `pendiente_revision`.
- Si se detecta duplicado por Drive ID, numero/proveedor o fecha/proveedor/total: `duplicado`.

## Carpetas trimestrales

- T1: enero, febrero, marzo.
- T2: abril, mayo, junio.
- T3: julio, agosto, septiembre.
- T4: octubre, noviembre, diciembre.

Ruta recomendada:

`Compras/{year}/T{quarter}/{supplier}/{YYYY-MM-DD}_{supplier}_{invoice_number}_{total}.pdf`
