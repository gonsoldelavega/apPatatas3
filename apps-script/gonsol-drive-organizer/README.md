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

## Comportamiento

- Todas las facturas entran como `pagado`.
- Si falta fecha, proveedor, numero o total, va a `REVISAR_MANUALMENTE`.
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

