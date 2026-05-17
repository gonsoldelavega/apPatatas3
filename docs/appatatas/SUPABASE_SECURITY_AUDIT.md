# Supabase Security Audit

## Tablas usadas

- `clientes`: lectura/escritura desde frontend.
- `proveedores`: lectura/escritura desde frontend.
- `productos`: lectura/escritura desde frontend.
- `facturas_venta`: lectura/escritura desde frontend.
- `facturas_compra`: lectura/escritura desde frontend.
- `gastos`: lectura/escritura desde frontend.
- `monedero`: lectura/escritura desde frontend.
- `app_settings`: lectura/escritura de ajustes compartidos y contador.
- `app_aux_state`: lectura/escritura de datos auxiliares compartidos.

## Operaciones desde frontend

- Select de tablas principales.
- Upsert de entidades mediante anon key.
- Delete de entidades desde acciones de UI.
- Reserva de numero de factura actualizando `app_settings.next_invoice_number`.

## Riesgos

- Si RLS permite demasiado con anon key, cualquier cliente con la clave publica podria modificar datos.
- Deletes desde frontend tienen mayor riesgo operativo.
- La reserva de numero depende de control transaccional con `next_invoice_number`.
- El agente Drive no debe usar service role desde frontend.

## Recomendaciones RLS

- Activar RLS en todas las tablas.
- Separar lectura/escritura por usuario, dispositivo o tenant si se formaliza multiusuario.
- Restringir deletes o moverlos a backend con token.
- Mantener `app_settings` protegido; la reserva de factura idealmente debe ser RPC transaccional.
- `processed_documents` deberia escribirse desde backend/n8n, no desde frontend anon.

## Que debe pasar a backend

- Reserva oficial de numero de factura mediante RPC o endpoint server-side.
- Procesamiento Drive y OCR.
- Escritura definitiva de compras/gastos importados.
- Deteccion de duplicados sensible.
- Deletes de datos criticos o acciones masivas.

## Service role

No se ha encontrado una `service_role` key hardcodeada en frontend. La app carga `SUPABASE_ANON_KEY` desde `/api/public-config`, que es publica por naturaleza. Mantener cualquier service role solo en Vercel/n8n/backend.
