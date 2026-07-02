param(
  [string]$Source = "D:\Programs\CatPawAI\resources\app\extensions\mt-idekit.mt-idekit-code\out\extension.js",
  [string]$Destination = "$PSScriptRoot\..\vendor\catpaw-extension\extension.js"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
  throw "CatPawAI extension.js not found: $Source"
}

$destinationPath = Resolve-Path -LiteralPath (Split-Path -Parent $Destination) -ErrorAction SilentlyContinue
if (-not $destinationPath) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
}

Copy-Item -LiteralPath $Source -Destination $Destination -Force
Write-Host "Copied CatPawAI extension.js to $Destination"
Write-Host "Package this project directory and upload it to Ubuntu with .env."
