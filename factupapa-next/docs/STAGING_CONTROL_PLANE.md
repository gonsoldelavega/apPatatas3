# Control privado de staging

Este mecanismo evita copiar instrucciones al VPS. Una tarea se escribe en la rama privada `automation/factupapa-staging-tasks` dentro de `.factupapa-control/task.json`. El runner rootless existente ejecuta una sola tarea, devuelve un resultado saneado a la misma rama y desactiva la tarea antes de hacer commit.

## Límites permanentes

- Solo admite `environment: "staging"`.
- Producción, `main`, n8n y FactuPapa antigua no son direccionables.
- `inspect` sirve para comprobaciones sin escrituras.
- `apply` exige `authorization: "user-confirmed"` y el agente debe crear backup, simulación transaccional y segunda simulación idempotente.
- Las tareas operativas no pueden modificar código; los cambios de aplicación siguen el flujo normal de ramas y auditoría.
- Los resultados se guardan en `.factupapa-control/results/` y se sanea cualquier token reconocible.

## Formato de tarea

```json
{
  "version": 1,
  "id": "revisar-cobros-20260822",
  "environment": "staging",
  "operation": "inspect",
  "authorization": "not-required",
  "enabled": true,
  "instructions": "Revisa los cobros importados y devuelve únicamente diferencias verificables."
}
```

Para una escritura validada, use `operation: "apply"` y `authorization: "user-confirmed"`. La rama debe permanecer privada y limitada a las personas autorizadas del negocio.
