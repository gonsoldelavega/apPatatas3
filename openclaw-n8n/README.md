# OpenClaw + n8n

Integracion local para usar agentes de OpenClaw desde n8n.

## Agentes creados

- `n8n-arquitecto`: disena workflows n8n usando n8n-MCP.
- `n8n-operador`: valida, depura y opera workflows n8n.

## MCP conectado

OpenClaw tiene registrado el servidor MCP `n8n`:

```powershell
openclaw mcp list
openclaw mcp show n8n
```

Configuracion actual: `npx --yes n8n-mcp` en modo `stdio`, sin API de n8n. Esto da acceso a documentacion, nodos, plantillas y validaciones. Para crear/modificar workflows directamente en tu instancia n8n hace falta anadir `N8N_API_URL` y `N8N_API_KEY`.

## Uso desde PowerShell

```powershell
openclaw agent --local --agent n8n-arquitecto --message "Disena un workflow n8n simple para recibir un webhook y responder JSON" --json
openclaw agent --local --agent n8n-operador --message "Revisa este workflow y dime riesgos principales" --json
```

## Uso desde n8n

En n8n usa un nodo **Execute Command** que llame a:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\nando\Documents\apPatatas\openclaw-n8n\call-openclaw-agent.ps1" -Agent "n8n-arquitecto" -Message "{{$json.prompt}}"
```

Para el operador:

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\Users\nando\Documents\apPatatas\openclaw-n8n\call-openclaw-agent.ps1" -Agent "n8n-operador" -Message "{{$json.prompt}}"
```

## Arrancar n8n

```powershell
n8n
```

Luego abre:

```text
http://localhost:5678
```

