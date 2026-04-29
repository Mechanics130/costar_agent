param(
  [string]$RepoRoot = "__COSTAR_REPO_ROOT__",
  [ValidateSet("desktop", "code", "both")]
  [string]$Mode = "both",
  [string]$DesktopConfigPath = "",
  [string]$ClaudeCodeProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ($RepoRoot -eq "__COSTAR_REPO_ROOT__") {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
}

function Write-Utf8NoBomFile {
  param(
    [string]$Path,
    [string]$Content
  )
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Backup-FileIfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    $backupPath = "$Path.bak"
    Copy-Item -LiteralPath $Path -Destination $backupPath -Force
  }
}

function ConvertTo-HashtableRecursive {
  param([AllowNull()]$InputObject)

  if ($null -eq $InputObject) {
    return $null
  }

  if ($InputObject -is [System.Collections.IDictionary]) {
    $table = @{}
    foreach ($key in $InputObject.Keys) {
      $table[$key] = ConvertTo-HashtableRecursive -InputObject $InputObject[$key]
    }
    return $table
  }

  if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
    $table = @{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $table[$property.Name] = ConvertTo-HashtableRecursive -InputObject $property.Value
    }
    return $table
  }

  if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
    $items = @()
    foreach ($item in $InputObject) {
      $items += ,(ConvertTo-HashtableRecursive -InputObject $item)
    }
    return $items
  }

  return $InputObject
}

function Get-JsonObjectOrDefault {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return @{ mcpServers = @{} }
  }
  $content = Get-Content -Raw $Path
  if (-not $content.Trim()) {
    return @{ mcpServers = @{} }
  }
  $parsed = ConvertTo-HashtableRecursive -InputObject ($content | ConvertFrom-Json)
  if ($null -eq $parsed -or -not ($parsed -is [System.Collections.IDictionary])) {
    $parsed = @{}
  }
  if (-not $parsed.ContainsKey("mcpServers") -or $null -eq $parsed["mcpServers"]) {
    $parsed["mcpServers"] = @{}
  }
  if (-not ($parsed["mcpServers"] -is [System.Collections.IDictionary])) {
    $parsed["mcpServers"] = @{}
  }
  return $parsed
}

if (-not (Test-Path $RepoRoot)) {
  throw "RepoRoot does not exist: $RepoRoot"
}

$bundleMcpRunner = Join-Path $PSScriptRoot "run-costar-mcp.mjs"
if (-not (Test-Path $bundleMcpRunner)) {
  throw "Missing run-costar-mcp.mjs next to install-claude-config.ps1: $bundleMcpRunner"
}

$mcpServerArgs = @(
  "$bundleMcpRunner"
)

$desktopPath = $DesktopConfigPath
if (-not $desktopPath) {
  $desktopPath = Join-Path $env:APPDATA "Claude\\claude_desktop_config.json"
}

$claudeCodeRoot = $ClaudeCodeProjectRoot
if (-not $claudeCodeRoot) {
  $claudeCodeRoot = $RepoRoot
}
$codePath = Join-Path $claudeCodeRoot ".mcp.json"

$result = @{
  repo_root = $RepoRoot
  desktop_config_path = $desktopPath
  code_config_path = $codePath
  updated = @()
}

if ($Mode -eq "desktop" -or $Mode -eq "both") {
  $desktopConfig = Get-JsonObjectOrDefault -Path $desktopPath
  $desktopConfig["mcpServers"]["costar"] = @{
    command = "node"
    args = $mcpServerArgs
  }
  Backup-FileIfExists -Path $desktopPath
  Write-Utf8NoBomFile -Path $desktopPath -Content (($desktopConfig | ConvertTo-Json -Depth 20) + "`n")
  $result.updated += "desktop"
}

if ($Mode -eq "code" -or $Mode -eq "both") {
  $codeConfig = Get-JsonObjectOrDefault -Path $codePath
  $codeConfig["mcpServers"]["costar"] = @{
    command = "node"
    args = $mcpServerArgs
  }
  Backup-FileIfExists -Path $codePath
  Write-Utf8NoBomFile -Path $codePath -Content (($codeConfig | ConvertTo-Json -Depth 20) + "`n")
  $result.updated += "code"
}

$result | ConvertTo-Json -Depth 10
