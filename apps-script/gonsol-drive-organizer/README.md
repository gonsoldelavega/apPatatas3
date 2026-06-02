# Gonsol Drive Organizer

Automatizacion barata para clasificar facturas de compra escaneadas en Google Drive y registrar los resultados en Google Sheets.

## Por que esta opcion

- No usa OpenAI por defecto.
- No necesita n8n encendido.
- Corre dentro de Google Apps Script con disparador diario.
- Usa OCR de Google Drive al convertir PDF/imagen a Google Docs.
- Solo aparta casos dudosos para revision manual.

## Archivos

- `Code.gs`: codigo principal para pegar en Apps Script.
- `appsscript.json`: manifest recomendado.

## IDs configurados

- Entrada compras: `99_PENDIENTE_DE_CLASIFICAR`
  `1ETAzvmssbDM7cLDUEy89quY0xEnNecd4`

- Registro maestro:
  `1wbpVv9TpJGz7KkM-k2BusqHnEzUikOaadRWbdkMDbDU`

- Hoja principal:
  `REGISTRO`

- Hoja resumen mensual:
  `COMPRAS_MENSUAL`

- Destino compras:
  `02_COMPRAS`
  `1Q627xLAkvxB_MqUMCYPsTXRKoJIOvMvR`

## Instalacion

1. Abre el Apps Script existente: `Gonsol Drive Organizer`.
2. Pega el contenido de `Code.gs`.
3. En Apps Script, abre `Project Settings` y activa `Show "appsscript.json" manifest file in editor`.
4. Pega/mezcla el contenido de `appsscript.json`.
5. Activa el servicio avanzado: `Services` -> `+` -> `Drive API` -> Add.
6. Ejecuta manualmente:

```javascript
setupDailyPurchaseInvoiceTrigger()
```

7. Autoriza permisos.
8. Prueba primero:

```javascript
processPurchaseInvoicesDaily()
```

## Proveedores reconocidos (parsers dedicados)

Para los proveedores habituales se extraen proveedor, NIF y numero de factura de
forma determinista (no por heuristica), lo que reduce errores y revisiones:

- **GAYCA** — `FRUTAS Y PATATAS GAYCA, S.A.` (NIF `A04037677`). Numero tipo `FV006-00000996`. IVA 4%.
- **FRUTCAYCAZ** — `J. EXPOSITO CAZORLA E HIJOS, S.L.` (NIF `B04854154`). Numero numerico tipo `26004132`. IVA 4%.

El NIF del propio negocio (`45313973V`, que aparece como cliente) se excluye para
no confundirlo con el del proveedor. Para anadir un proveedor nuevo, copia un bloque
de `GONSOL_SUPPLIERS` en `Code.gs` con su `detect`, `nif` y `invoiceNumber`.

## Comportamiento

- Todas las facturas entran como `pagado`.
- Proveedor reconocido: basta con `fecha + total` para registrar. Si falta el numero,
  se registra igualmente y se anota en `observaciones` (no se manda a revision por eso).
- Proveedor desconocido: si falta fecha, proveedor, numero o total, va a `REVISAR_MANUALMENTE`.
- El IVA de alimentacion (4%) se asume cuando el proveedor es conocido y no se lee en el texto.
- Se prefiere la fecha junto a la palabra `FECHA` (emision) en vez de la primera fecha del documento.
- Si ya existe `proveedor + numero + total`, se aparta a `REVISAR_MANUALMENTE/DUPLICADOS` y no se registra.
- Si se clasifica bien, se mueve a `02_COMPRAS/<ANIO>/<T1..T4>`.
- Renombra con la regla `AAAA-MM-DD_FACTURA_COMPRA_PROVEEDOR_NUMERO_TOTAL.pdf`.
- Reconstruye `COMPRAS_MENSUAL`, agrupando compras por mes y poniendo debajo de cada mes:
  - total base imponible
  - total IVA
  - total final

## Actualizar resumen mensual manualmente

Si quieres reconstruir la hoja mensual sin procesar nuevas facturas, ejecuta:

```javascript
rebuildPurchaseMonthlySummary()
```

## Limitaciones

La extraccion por OCR + regex es barata, pero no infalible. Si una factura tiene formato raro, ira a revision manual en vez de inventar datos.

