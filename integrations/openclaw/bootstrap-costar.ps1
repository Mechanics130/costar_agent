param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$OpenClawSkillsDir = "",
  [string]$BaseUrl = "",
  [string]$Model = "",
  [string]$ApiKey = "",
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"

function Read-IfEmpty {
  param(
    [string]$Value,
    [string]$Prompt,
    [switch]$Secret
  )
  if ($Value) {
    return $Value
  }
  if ($Secret) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
      if ($ptr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
      }
    }
  }
  return (Read-Host $Prompt)
}

function Write-Utf8NoBomFile {
  param(
    [string]$Path,
    [string]$Content
  )
  $dir = Split-Path -Parent $Path
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

if (-not (Test-Path $RepoRoot)) {
  throw "RepoRoot does not exist: $RepoRoot"
}

$BaseUrl = Read-IfEmpty -Value $BaseUrl -Prompt "OpenAI-compatible base URL"
$Model = Read-IfEmpty -Value $Model -Prompt "Model name"
$ApiKey = Read-IfEmpty -Value $ApiKey -Prompt "API key" -Secret

$modelConfigPath = Join-Path $RepoRoot "relationship-ingestion\runtime\model-config.local.json"
$modelConfig = @{
  provider = "openai-compatible"
  base_url = $BaseUrl
  model = $Model
  api_key = $ApiKey
  temperature = 0.1
  source = "bootstrap-costar.ps1"
}

Write-Utf8NoBomFile -Path $modelConfigPath -Content (($modelConfig | ConvertTo-Json -Depth 6) + "`n")
Write-Host "Wrote model config: $modelConfigPath"

$adapterSource = Join-Path $RepoRoot "integrations\openclaw\CoStar"
if (-not (Test-Path $adapterSource)) {
  throw "Adapter source not found: $adapterSource"
}

if ($OpenClawSkillsDir) {
  $adapterTarget = Join-Path $OpenClawSkillsDir "CoStar"
  if (-not (Test-Path $adapterTarget)) {
    New-Item -ItemType Directory -Force -Path $adapterTarget | Out-Null
  }

  foreach ($name in @("README.md", "SKILL.md")) {
    $sourcePath = Join-Path $adapterSource $name
    $targetPath = Join-Path $adapterTarget $name
    $content = Get-Content -Raw $sourcePath
    $content = $content.Replace("{{COSTAR_REPO_ROOT}}", $RepoRoot)
    Write-Utf8NoBomFile -Path $targetPath -Content $content
  }

  Write-Host "Installed OpenClaw adapter: $adapterTarget"
}
else {
  Write-Host "OpenClawSkillsDir not provided. Adapter files were not copied."
  Write-Host "Source adapter is available at: $adapterSource"
}

if (-not $SkipSmoke) {
  Push-Location $RepoRoot
  try {
    Write-Host "Running smoke checks..."
    node relationship-profile\runtime\profile-smoke.mjs
    node relationship-graph\runtime\graph-smoke.mjs
    node relationship-view\runtime\view-smoke.mjs
    node relationship-roleplay\runtime\roleplay-smoke.mjs
  }
  finally {
    Pop-Location
  }
}

Write-Host "CoStar bootstrap complete."
