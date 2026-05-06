param(
  [Parameter(Mandatory=$true)]
  [string]$Prompt,

  [string]$Thinking = "off",
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

openclaw agent `
  --local `
  --agent facturas-drive `
  --message $Prompt `
  --thinking $Thinking `
  --timeout $TimeoutSeconds `
  --json

