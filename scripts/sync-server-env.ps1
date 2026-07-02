param(
  [string]$Server = "kingdom@120.48.71.69",
  [string]$RemoteDir = "/opt/catpawai-proxy",
  [int]$RemotePort = 13000,
  [string]$ServiceName = "catpawai-proxy"
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $projectRoot ".env"

Push-Location $projectRoot
try {
  node scripts/import-from-catpaw-state.js

  if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
    throw ".env was not generated: $envPath"
  }

  $content = Get-Content -Raw -LiteralPath $envPath
  if ($content -match "(?m)^PORT=") {
    $content = [regex]::Replace($content, "(?m)^PORT=.*$", "PORT=$RemotePort")
  } else {
    $content = $content.TrimEnd() + "`nPORT=$RemotePort`n"
  }
  Set-Content -LiteralPath $envPath -Value $content -Encoding UTF8

  scp $envPath "${Server}:${RemoteDir}/.env"
  ssh $Server "cd '$RemoteDir' && sed -i 's/^PORT=.*/PORT=$RemotePort/' .env && sudo systemctl restart '$ServiceName' && systemctl is-active '$ServiceName'"
  Write-Host "Synced .env and restarted $ServiceName on $Server."
} finally {
  Pop-Location
}
