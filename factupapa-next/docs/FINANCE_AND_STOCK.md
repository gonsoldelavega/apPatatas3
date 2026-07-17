# Compras, gastos y stock

FactuPapa ofrece un control **operativo**, no contabilidad ni asesoramiento fiscal: ventas emitidas menos compras confirmadas y gastos mensuales. El stock suma compras confirmadas, resta facturas directas o albaranes emitidos y aplica ajustes manuales; una factura procedente de albaranes no duplica la salida.

Los PDF o imágenes de compras se guardan en MinIO privado y solo se descargan por la API autenticada. El texto extraído de los PDF se descarta y las sugerencias siempre requieren revisión. Las imágenes quedan para revisión manual; el OCR completo es una mejora posterior.

La numeración permanece en modo `TEST` hasta el cambio definitivo. Si el último número real es 128, se registra 128 en el asistente y la primera factura real será 129. Antes del corte deben retirarse los datos ficticios y verificarse backup, restauración y gestoría.
