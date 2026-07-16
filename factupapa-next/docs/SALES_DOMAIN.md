# Dominio inicial de ventas

La migración aditiva `0006_sales_documents.sql` incorpora secuencias, albaranes, líneas y el vínculo albarán-factura, y amplía facturas sin alterar migraciones previas. Todo usa UUID, `company_id`, claves tenant, RLS y `FORCE ROW LEVEL SECURITY`.

Los borradores no tienen número. Al emitir, una transacción incrementa `(company_id, document_type, series)` y asigna número, estado y auditoría. Los números cancelados no se reutilizan.

Las líneas conservan snapshot de descripción, unidad, precio e IVA. Los importes usan `numeric(16,4)` y el backend calcula totales con enteros escalados; nunca acepta totales del cliente. El precio específico vigente se aplica al crear la línea. Facturas conservan también el snapshot fiscal del cliente.

Convertir albaranes exige estado `issued`, mismo cliente y ausencia de facturación previa. Copia, vínculo y cambio a `invoiced` son una sola transacción.

El PDF A4 se genera al vuelo desde el snapshot, solo para factura emitida y con límite de 5 MB. Incluye nombre, NIF y dirección configurada de la empresa, además del snapshot fiscal del cliente. No incluye firma digital, QR fiscal, VeriFactu ni factura electrónica y no está listo para uso legal real.

`0011_company_sales_preferences.sql` añade preferencias tenant con RLS forzado. El valor inicial favorece la operativa de factura directa: prefijo `FAC`, primer número anual 100 e IVA 4 %. Internamente la serie anual se conserva como `FAC_2026`, pero se presenta al usuario y en el PDF como `FAC-100/2026`, sin ceros de relleno. La configuración no permite cambiar el número inicial una vez usada la secuencia del año.

La interfaz no muestra ceros técnicos: cantidades eliminan decimales finales, precios unitarios conservan al menos dos decimales y los totales monetarios muestran exactamente dos. Esto es solo presentación; PostgreSQL, snapshots y cálculos mantienen su precisión `numeric`.

El ensayo de recuperación incluye numeración, snapshots, vínculos albarán-factura, auditoría, inmutabilidad y regeneración del PDF. Una factura cancelada libera transaccionalmente sus vínculos activos y devuelve los albaranes a `issued`; los números emitidos nunca se reutilizan.
