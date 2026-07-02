param(
  [switch]$FromClipboard
)

$ErrorActionPreference = "Stop"

function Read-ConfigText {
  if ($FromClipboard) {
    try {
      $clip = Get-Clipboard -Raw
      if ($clip -and $clip.Trim().Length -gt 0) {
        Write-Host "Reading CatPawAI config.toml from clipboard..."
        return $clip
      }
    } catch {
      Write-Host "Clipboard read failed, falling back to manual paste."
    }
  }

  Write-Host "Paste CatPawAI config.toml content. Finish with a single line containing END."
  $lines = New-Object System.Collections.Generic.List[string]
  while ($true) {
    $line = Read-Host
    if ($line -eq "END") { break }
    $lines.Add($line)
  }
  return ($lines -join "`n")
}

function Get-TomlStringValue {
  param(
    [string]$Text,
    [string[]]$Keys
  )
  foreach ($key in $Keys) {
    $pattern = "(?im)^\s*$([regex]::Escape($key))\s*=\s*[""']([^""']+)[""']"
    $match = [regex]::Match($Text, $pattern)
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
  }
  return ""
}

function Get-UrlLikeValue {
  param([string]$Text)
  $keys = @("base_url", "baseURL", "api_base", "apiBase", "openai_base_url", "openaiBaseUrl", "url")
  $value = Get-TomlStringValue $Text $keys
  if ($value) { return $value }

  $match = [regex]::Match($Text, "(?i)https?://[^\s""']+/v1")
  if ($match.Success) { return $match.Value.TrimEnd("/") }
  return ""
}

function Set-EnvLine {
  param(
    [string[]]$Lines,
    [string]$Key,
    [string]$Value
  )
  $escaped = $Value -replace "`r|`n", ""
  $found = $false
  $next = foreach ($line in $Lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))=") {
      $found = $true
      "$Key=$escaped"
    } else {
      $line
    }
  }
  if (-not $found) { $next += "$Key=$escaped" }
  return $next
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$envPath = Join-Path $repoRoot ".env"
$examplePath = Join-Path $repoRoot ".env.example"

if (Test-Path -LiteralPath $envPath) {
  $lines = Get-Content -LiteralPath $envPath
} elseif (Test-Path -LiteralPath $examplePath) {
  $lines = Get-Content -LiteralPath $examplePath
} else {
  $lines = @()
}

$configText = Read-ConfigText
$baseUrl = Get-UrlLikeValue $configText
$apiKey = Get-TomlStringValue $configText @("api_key", "apikey", "apiKey", "key", "token")
$model = Get-TomlStringValue $configText @("model")

if (-not $baseUrl) {
  Write-Host "Could not find base_url/api_base/http://.../v1 in the copied config."
  Write-Host "Please open CatPawAI config.toml, copy all text, and run this importer again."
  exit 1
}

if (-not $apiKey) {
  Write-Host "Could not find api_key in the copied config."
  $secure = Read-Host "Paste API Key manually" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

if (-not $model) {
  $model = "deepseek-v3.2"
}

$lines = Set-EnvLine $lines "HOST" "127.0.0.1"
$lines = Set-EnvLine $lines "PORT" "13000"
$lines = Set-EnvLine $lines "CATPAWAI_OPENAI_BASE_URL" ($baseUrl.TrimEnd("/"))
$lines = Set-EnvLine $lines "CATPAWAI_AUTH_MODE" "bearer"
$lines = Set-EnvLine $lines "CATPAWAI_API_KEY" $apiKey
$lines = Set-EnvLine $lines "CATPAWAI_ACCESS_TOKEN" ""
$lines = Set-EnvLine $lines "CATPAWAI_MIS_ID" ""
$lines = Set-EnvLine $lines "CATPAWAI_MODEL" $model

Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8

Write-Host ".env updated from CatPawAI config.toml."
Write-Host "Base URL: $($baseUrl.TrimEnd('/'))"
Write-Host "Model: $model"
Write-Host "API Key configured. Length: $($apiKey.Length)"
