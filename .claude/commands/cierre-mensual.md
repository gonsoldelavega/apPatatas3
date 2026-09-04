---
description: Cierre mensual para la gestoría con datos de solo lectura y borrador opcional de Gmail
---

# Cierre mensual

Prepara la documentación mensual para la gestoría (Bongest).

Este workflow es **solo lectura respecto a datos contables y de negocio**: no modifica facturas, compras, gastos, `REGISTRO`, archivos de Drive ni estado de producción.

La única escritura opcional permitida por este workflow es **crear un borrador de Gmail**. Nunca envía el correo.

Sigue `AGENTS.md`; este workflow no crea puertas de aprobación adicionales.

`$ARGUMENTS` = mes `YYYY-MM`. Si está vacío, usa el **último mes natural completo**, salvo que el contexto del usuario identifique claramente otro mes.

## Token secreto

Necesitas `APP_SYNC_TOKEN` para la nube.

- Usa la variable de entorno si existe.
- Nunca escribas el token en archivos ni commits.
- Si el cierre solicitado depende de la nube y no hay token disponible, pídelo una sola vez.
- No ejecutes este workflow de forma automática solo porque haya empezado un mes nuevo durante una tarea no relacionada; aplica las condiciones de `AGENTS.md`.

## 1. Obtén las fuentes en modo lectura

### Nube

Consulta `https://ap-patatas3.vercel.app/api/app-state` con `APP_SYNC_TOKEN` y guarda cualquier copia temporal fuera del repo.

### REGISTRO

Descarga la hoja `REGISTRO` de Google Sheets en modo lectura y guarda cualquier copia temporal fuera del repo.

### Gmail

Si el conector está disponible, localiza en modo lectura facturas/documentos del mes que deban cruzarse con el cierre.

### Drive

Usa Drive en modo lectura para comprobar la existencia/ubicación de adjuntos cuando las herramientas disponibles lo permitan.

## 2. Compila el mes objetivo

### Compras

- filtra filas `tipo=compra` del mes;
- cuenta facturas;
- suma totales;
- agrupa por proveedor;
- marca `Revisado=no` o equivalentes como pendientes;
- detecta posibles asignaciones al mes incorrecto.

### Gastos

En `state.expenses`, incluye gastos del mes como:

- cuota de autónomos;
- gestoría;
- combustible/Solred;
- otros gastos registrados que correspondan al mes.

No inventes categorías ni deducibilidad fiscal si los datos no la acreditan.

### Ventas

En `state.invoices`, usa `issueDate` del mes objetivo:

- número de facturas;
- total IVA incluido;
- cualquier anomalía evidente de numeración/fecha que afecte al cierre.

### Cruce documental

Si Gmail/Drive están disponibles, comprueba documentos esperables de proveedores como GAYCA, Solred/Repsol y Bongest.

Distingue claramente:

- documento encontrado y registrado;
- documento encontrado pero aparentemente ausente del registro;
- registro sin documento localizado;
- coincidencia dudosa.

## 3. Reutiliza la lógica de integridad

Aplica las comprobaciones relevantes de `.claude/commands/revisar-datos.md` o `.agents/skills/factupapa-data-audit/SKILL.md` sin modificar datos.

No detengas el cierre al primer descuadre. Completa el análisis y reúne todos los problemas en un único bloque final.

## 4. Genera el resumen

Entrega una tabla clara del mes con, como mínimo:

- ventas;
- compras por proveedor;
- otros gastos;
- totales;
- número de documentos;
- pendientes de revisión.

Si calculas un total potencialmente deducible, etiqueta claramente qué criterio/datos lo sustentan y no presentes como certeza fiscal lo que no pueda verificarse.

## 5. Prepara el correo a Bongest

Destinatario conocido: `gestion@bongest.es`.

Busca primero un hilo de recordatorio del mes si Gmail está disponible y conviene responderlo.

El borrador debe ser breve y contener:

- referencia al mes;
- ventas;
- compras;
- otros gastos relevantes;
- cualquier documento pendiente;
- una pregunta final si hay alguna discrepancia que la gestoría deba revisar.

### Regla de escritura de Gmail

Crear un **borrador** está permitido como parte de este workflow cuando la herramienta disponible lo soporte y el cierre mensual haya sido solicitado/autorizado.

- Crear borrador no equivale a enviar.
- **Nunca pulses enviar ni ejecutes una acción de envío dentro de este workflow.**
- Si no puede crearse el borrador, entrega el texto completo listo para copiar/pegar en lugar de detener todo el cierre.

## 6. Checklist de adjuntos

Incluye una lista concreta de lo que debe acompañar al correo, por ejemplo:

- compras: PDFs en `02_COMPRAS/<año>/T<trimestre>/<mes>` o ubicación real verificada;
- documentos en `REVISAR_MANUALMENTE` que deban resolverse;
- ventas: PDF/unificado del mes cuando exista;
- recibo de autónomos;
- factura Solred/combustible;
- documentación adicional detectada durante el cruce.

No afirmes que un archivo existe si no lo has verificado.

## 7. Informe de descuadres

Agrupa en un único bloque:

- compras sin revisar;
- posibles duplicados;
- proveedores mal asignados;
- facturas de correo aparentemente ausentes del registro;
- documentos del registro no localizados;
- diferencias de mes o fecha.

Propón la reparación concreta, pero no modifiques datos dentro de este workflow.

## Resultado final

El cierre termina con:

1. resumen financiero/documental;
2. descuadres y pendientes;
3. checklist de adjuntos;
4. borrador de correo creado o, si no fue posible, texto listo para copiar;
5. fuentes que no pudieron verificarse y motivo exacto.

**No envíes el correo.** El envío requiere una instrucción explícita separada del usuario.
