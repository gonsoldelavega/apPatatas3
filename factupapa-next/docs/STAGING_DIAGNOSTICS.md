# Diagnóstico del despliegue a staging

Si el paso «Deploy exact audited SHA to private staging» falla, el workflow publica en el
estado del commit (pestaña de checks / `commits/<sha>/statuses`) tres contextos:

- `FactuPapa staging deploy where`: línea y comando del script que falló.
- `FactuPapa staging deploy error`: último mensaje de error relevante del log.
- `FactuPapa staging deploy disk`: uso de disco del runner.

Los textos se sanean (solo alfanuméricos y signos básicos) y no incluyen secretos.
- `FactuPapa staging deploy last lines`: últimas líneas del log.
- Si hay logs de la API, se publican sus 2 últimas líneas de error como `api log N`.
