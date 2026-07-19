# Compras, gastos y stock

FactuPapa ofrece un control **operativo**, no contabilidad ni asesoramiento fiscal: ventas emitidas menos compras confirmadas y gastos mensuales. El stock suma compras confirmadas, resta facturas directas o albaranes emitidos y aplica ajustes manuales; una factura procedente de albaranes no duplica la salida.

Los PDF o imágenes de compras se guardan en MinIO privado y solo se descargan por la API autenticada. Cuando `ANTHROPIC_API_KEY` está configurada, FactuPapa envía a la API comercial de Anthropic el texto del PDF o, si es un escaneo, como máximo las dos primeras páginas preparadas como imagen. Claude Haiku 4.5 es el extractor principal y Tesseract en español e inglés se usa únicamente si Anthropic no está disponible o si se alcanza el límite de uso. El texto completo reconocido no se guarda en PostgreSQL.

`OWN_TAX_IDS` contiene los NIF/DNI propios exclusivamente en el entorno privado y permite descartar el identificador del comprador cuando se busca al proveedor. Anthropic no puede activarse si falta esa variable. Cada intento de pago se reserva previamente en PostgreSQL bajo un bloqueo por empresa. Los valores predeterminados permiten cinco intentos diarios, cincuenta mensuales y un máximo absoluto de 0,40 USD al mes; al alcanzar cualquiera de esos límites no se hace la llamada de pago y se continúa con Tesseract.

El resultado propone proveedor por NIF, número, fechas, base, IVA, total y concepto. La interfaz muestra confianza y advertencias, y nunca contabiliza la factura automáticamente: una persona debe revisar y confirmar los campos. El original privado queda vinculado a la compra para su trazabilidad.

Cuando una factura indica sacos, el OCR propone el número de sacos y sus kilos usando 15 kg por saco. Al seleccionar el producto y confirmar la compra, esos kilos entran en stock. Las ventas emitidas los descuentan. La merma no se estima: el usuario realiza un recuento físico en sacos completos más kilos sueltos y FactuPapa registra como ajuste auditable únicamente la diferencia.

La numeración permanece en modo `TEST` hasta el cambio definitivo. Si el último número real es 128, se registra 128 en el asistente y la primera factura real será 129. Antes del corte deben retirarse los datos ficticios y verificarse backup, restauración y gestoría.
