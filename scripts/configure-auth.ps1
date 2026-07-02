param(
  [switch]$InternalTenant,
  [switch]$FromClipboard
)

$ErrorActionPreference = "Stop"

function ConvertFrom-SecureStringPlain {
  param([securestring]$Secure)
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Read-MultilineHeaders {
  if ($FromClipboard) {
    try {
      $clip = Get-Clipboard -Raw
      if ($clip -and $clip.Trim().Length -gt 0) {
        Write-Host "Reading CatPawAI headers from clipboard..."
        return $clip
      }
    } catch {
      Write-Host "Clipboard read failed, falling back to manual paste."
    }
  }

  Write-Host "Paste CatPawAI request headers. Finish with a single line containing END."
  Write-Host "Accepted fields include Catpaw-Auth, Cookie, mis-id, user-mis-id, tenant."
  $lines = New-Object System.Collections.Generic.List[string]
  while ($true) {
    $line = Read-Host
    if ($line -eq "END") { break }
    $lines.Add($line)
  }
  return ($lines -join "`n")
}

function Get-HeaderValue {
  param(
    [string]$Text,
    [string[]]$Names
  )
  foreach ($name in $Names) {
    $pattern = "(?im)^\s*$([regex]::Escape($name))\s*[:=]\s*(.+?)\s*$"
    $match = [regex]::Match($Text, $pattern)
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
  }
  return ""
}

function Get-CookieValue {
  param(
    [string]$Cookie,
    [string[]]$Names
  )
  foreach ($name in $Names) {
    $pattern = "(?:^|;\s*)$([regex]::Escape($name))=([^;]+)"
    $match = [regex]::Match($Cookie, $pattern)
    if ($match.Success) { return $match.Groups[1].Value.Trim() }
  }
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

$headers = Read-MultilineHeaders
$token = Get-HeaderValue $headers @("Catpaw-Auth", "catpaw-auth")
$cookie = Get-HeaderValue $headers @("Cookie", "cookie")
$misId = Get-HeaderValue $headers @("mis-id", "user-mis-id", "user-uid")
$tenant = Get-HeaderValue $headers @("tenant")

if (-not $token -and $cookie) {
  $token = Get-CookieValue $cookie @(
    "1d47d6ff96_passportid",
    "1d47d6ff96_ssoid",
    "f32a546874_ssoid"
  )
}

if (-not $token) {
  $secure = Read-Host "CatPawAI token was not found in headers. Paste token manually" -AsSecureString
  $token = ConvertFrom-SecureStringPlain $secure
}

if (-not $misId) {
  $misId = Read-Host "mis-id/user-mis-id was not found. Paste it manually, or press Enter to leave blank"
}

if (-not $tenant) {
  $tenant = if ($InternalTenant) { "4391f0be98" } else { "5282fa6645" }
}

$baseUrl = if ($tenant -eq "4391f0be98") {
  "https://catpaw.sankuai.com/api/gpt"
} else {
  "https://catpaw.meituan.com/api/gpt"
}

$lines = Set-EnvLine $lines "HOST" "127.0.0.1"
$lines = Set-EnvLine $lines "PORT" "13000"
$lines = Set-EnvLine $lines "CATPAWAI_OPENAI_BASE_URL" $baseUrl
$lines = Set-EnvLine $lines "CATPAWAI_AUTH_MODE" "catpaw"
$lines = Set-EnvLine $lines "CATPAWAI_ACCESS_TOKEN" $token
$lines = Set-EnvLine $lines "CATPAWAI_MIS_ID" $misId
$lines = Set-EnvLine $lines "CATPAWAI_TENANT" $tenant
$lines = Set-EnvLine $lines "CATPAWAI_MODEL" "deepseek-v3.2"

Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8

Write-Host ".env updated."
Write-Host "Token length: $($token.Length)"
Write-Host "Tenant: $tenant"
if ($misId) { Write-Host "mis-id configured." } else { Write-Host "mis-id left blank." }
