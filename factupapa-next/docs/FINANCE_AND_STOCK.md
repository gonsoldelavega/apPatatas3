# Compras, gastos y stock

FactuPapa ofrece un control **operativo**, no contabilidad ni asesoramiento fiscal: ventas emitidas menos compras confirmadas y gastos mensuales. El stock suma compras confirmadas, resta facturas directas o albaranes emitidos y aplica ajustes manuales; una factura procedente de albaranes no duplica la salida.

Los PDF o imágenes de compras se guardan en MinIO privado y solo se descargan por la API autenticada. El OCR se ejecuta dentro de la infraestructura de FactuPapa: primero intenta leer el texto nativo del PDF y, si no es suficiente, mejora y reconoce las dos primeras páginas con Tesseract en español e inglés. No se envían documentos a terceros y el texto completo reconocido se descarta.

El resultado propone proveedor por NIF, número, fechas, base, IVA, total y concepto. La interfaz muestra confianza y advertencias, y nunca contabiliza la factura automáticamente: una persona debe revisar y confirmar los campos. El original privado queda vinculado a la compra para su trazabilidad.

La numeración permanece en modo `TEST` hasta el cambio definitivo. Si el último número real es 128, se registra 128 en el asistente y la primera factura real será 129. Antes del corte deben retirarse los datos ficticios y verificarse backup, restauración y gestoría.
