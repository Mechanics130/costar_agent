param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [string]$TargetDir = ""
)

$ErrorActionPreference = "Stop"

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

function ConvertTo-JsonStringContent {
  param([string]$Value)

  $json = ConvertTo-Json -InputObject $Value -Compress
  if ($json.Length -lt 2) {
    return $json
  }
  return $json.Substring(1, $json.Length - 2)
}

if (-not (Test-Path $RepoRoot)) {
  throw "RepoRoot does not exist: $RepoRoot"
}

$adapterSource = Join-Path $RepoRoot "integrations\\claude"
if (-not (Test-Path $adapterSource)) {
  throw "Claude adapter source not found: $adapterSource"
}

if (-not $TargetDir) {
  Write-Host "No TargetDir provided. Claude skeleton remains in-place:"
  Write-Host $adapterSource
  exit 0
}

$adapterTarget = Join-Path $TargetDir "CoStar-Claude"
if (-not (Test-Path $adapterTarget)) {
  New-Item -ItemType Directory -Force -Path $adapterTarget | Out-Null
}

$repoRootJs = ConvertTo-JsonStringContent -Value $RepoRoot
$jsonSafeRepoRoot = ConvertTo-JsonStringContent -Value $RepoRoot
$jsonSafeAdapterTarget = ConvertTo-JsonStringContent -Value $adapterTarget
$bridgeCommandRaw = "node `"$RepoRoot\costar-core\host-model-adapter\run-host-tool.mjs`""
$bridgeCommandJson = ConvertTo-JsonStringContent -Value $bridgeCommandRaw

foreach ($name in @("README.md", "QUICKSTART.md", "FIRST_SESSION.md", "FINAL_USER_ACCEPTANCE.md", "FINAL_USER_RESULTS_TEMPLATE.md", "tool-exposure.json", "sample-workflow.md", "TEST_REQUIREMENTS.md", "TEST_PACK.md", "TEST_RESULTS_TEMPLATE.md", "MOCK_TRANSCRIPT.md", "claude-desktop.mcp.json", "claude-code.mcp.json", "manifest.json", "install-claude-config.ps1", "install-claude-config.mjs", "doctor-claude-install.mjs", "run-costar-mcp.mjs")) {
  $sourcePath = Join-Path $adapterSource $name
  $targetPath = Join-Path $adapterTarget $name
  $content = Get-Content -Raw $sourcePath
  $isJsonFile = $name.EndsWith(".json")
  if ($isJsonFile) {
    $content = $content.Replace("node costar-core/host-model-adapter/run-host-tool.mjs", $bridgeCommandJson)
    $content = $content.Replace("{{COSTAR_REPO_ROOT}}", $jsonSafeRepoRoot)
    $content = $content.Replace("{{CLAUDE_BUNDLE_ROOT}}", $jsonSafeAdapterTarget)
  } else {
    $content = $content.Replace("node costar-core/host-model-adapter/run-host-tool.mjs", $bridgeCommandRaw)
    $content = $content.Replace("{{COSTAR_REPO_ROOT}}", $RepoRoot)
    $content = $content.Replace("{{CLAUDE_BUNDLE_ROOT}}", $adapterTarget)
  }
  if ($name -eq "install-claude-config.ps1") {
    $content = $content -replace '\[string\]\$RepoRoot = "__COSTAR_REPO_ROOT__"', "[string]`$RepoRoot = `"$RepoRoot`""
  }
  if ($name -eq "run-costar-mcp.mjs") {
    $content = $content.Replace("__COSTAR_REPO_ROOT__", $repoRootJs)
  }
  if ($name -eq "install-claude-config.mjs") {
    $content = $content.Replace("__COSTAR_REPO_ROOT__", $repoRootJs)
  }
  Write-Utf8NoBomFile -Path $targetPath -Content $content
}

$sampleTarget = Join-Path $adapterTarget "samples"
if (-not (Test-Path $sampleTarget)) {
  New-Item -ItemType Directory -Force -Path $sampleTarget | Out-Null
}

$sampleSource = Join-Path $RepoRoot "costar-core\\host-model-adapter\\samples"
Get-ChildItem -Path $sampleSource -File | ForEach-Object {
  $targetPath = Join-Path $sampleTarget $_.Name
  $content = Get-Content -Raw $_.FullName
  Write-Utf8NoBomFile -Path $targetPath -Content $content
}

$promptPacketPath = Join-Path $adapterTarget "PROMPT_PACKET.md"
& node (Join-Path $RepoRoot "costar-core\\host-model-adapter\\render-host-prompt-packet.mjs") --host claude --output $promptPacketPath | Out-Null

$sessionProtocolPath = Join-Path $adapterTarget "SESSION_PROTOCOL.md"
& node (Join-Path $RepoRoot "costar-core\\host-model-adapter\\render-host-session-protocol.mjs") --host claude --output $sessionProtocolPath | Out-Null

Write-Host "Installed Claude adapter skeleton:"
Write-Host $adapterTarget
