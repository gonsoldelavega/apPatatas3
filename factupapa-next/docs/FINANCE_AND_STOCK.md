# Compras, gastos y stock

FactuPapa ofrece un control **operativo**, no contabilidad ni asesoramiento fiscal: ventas emitidas menos compras confirmadas y gastos mensuales. El stock suma compras confirmadas, resta facturas directas o albaranes emitidos, incorpora las transformaciones de producción y aplica ajustes manuales; una factura procedente de albaranes no duplica la salida.

Los PDF o imágenes de compras se guardan en MinIO privado y solo se descargan por la API autenticada. Cuando `ANTHROPIC_API_KEY` está configurada, FactuPapa envía a la API comercial de Anthropic el texto del PDF o, si es un escaneo, como máximo las dos primeras páginas preparadas como imagen. Claude Haiku 4.5 es el extractor principal y Tesseract en español e inglés se usa únicamente si Anthropic no está disponible o si se alcanza el límite de uso. El texto completo reconocido no se guarda en PostgreSQL.

`OWN_TAX_IDS` contiene los NIF/DNI propios exclusivamente en el entorno privado y permite descartar el identificador del comprador cuando se busca al proveedor. Anthropic no puede activarse si falta esa variable. Cada intento de pago se reserva previamente en PostgreSQL bajo un bloqueo por empresa. Los valores predeterminados permiten cinco intentos diarios, cincuenta mensuales y un máximo absoluto de 0,40 USD al mes; al alcanzar cualquiera de esos límites no se hace la llamada de pago y se continúa con Tesseract.

El resultado propone proveedor por NIF, número, fechas, base, IVA, total y concepto. La interfaz muestra confianza y advertencias, y nunca contabiliza la factura automáticamente: una persona debe revisar y confirmar los campos. El original privado queda vinculado a la compra para su trazabilidad.

Cada producto puede definir su formato (bolsa, caja, saco, bandeja u otro), contenido por envase, coste del envase y merma prevista. La venta se introduce por envases o por unidad base y ambos datos se guardan en la factura. Las producciones descuentan materia prima, suman producto terminado y registran la merma real. El recuento físico sigue disponible como corrección auditable.

Los cobros y pagos admiten varios movimientos por documento. La aplicación calcula pendiente, parcial, pagado y vencido sin alterar el estado jurídico del documento emitido. La ficha del cliente reúne facturación, cobros, deuda, vencidos y productos habituales.

La numeración permanece en modo `TEST` hasta el cambio definitivo. Si el último número real es 128, se registra 128 en el asistente y la primera factura real será 129. Antes del corte deben retirarse los datos ficticios y verificarse backup, restauración y gestoría.
