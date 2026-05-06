param(
  [Parameter(Mandatory=$true)]
  [ValidateSet("main", "n8n-arquitecto", "n8n-operador")]
  [string]$Agent,

  [Parameter(Mandatory=$true)]
  [string]$Message,

  [string]$Thinking = "off",
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

openclaw agent `
  --local `
  --agent $Agent `
  --message $Message `
  --thinking $Thinking `
  --timeout $TimeoutSeconds `
  --json

