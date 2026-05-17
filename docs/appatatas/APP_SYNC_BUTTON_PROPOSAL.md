# App Sync Button Proposal

## Implementado

En Ajustes:

- "Reparar sincronizacion local"
- "Sincronizar facturas de Drive ahora"

## Reparar sincronizacion local

Comportamiento:

1. Lee ajustes compartidos y entidades principales desde Supabase.
2. Si Supabase responde, hidrata el estado local.
3. Limpia metadatos corruptos de sync.
4. Muestra toast con resumen.
5. Si Supabase falla, no borra datos locales.

Riesgo: si Supabase contiene datos incompletos, la copia local se alinea con Supabase. Usar cuando Supabase sea la fuente fiable.

## Sincronizar facturas de Drive ahora

Comportamiento:

1. Llama a `POST /api/drive-invoices-sync`.
2. Envia token por `x-sync-token`.
3. El endpoint llama a n8n si `N8N_DRIVE_INVOICES_WEBHOOK_URL` esta configurada.
4. Por defecto envia `dryRun: true`.

No mueve archivos reales ni procesa facturas reales hasta que n8n implemente el workflow y se active `dryRun=false` de forma controlada.
