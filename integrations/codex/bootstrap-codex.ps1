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

if (-not (Test-Path $RepoRoot)) {
  throw "RepoRoot does not exist: $RepoRoot"
}

$adapterSource = Join-Path $RepoRoot "integrations\\codex"
if (-not (Test-Path $adapterSource)) {
  throw "Codex adapter source not found: $adapterSource"
}

if (-not $TargetDir) {
  Write-Host "No TargetDir provided. Codex adapter remains in-place:"
  Write-Host $adapterSource
  exit 0
}

$adapterTarget = Join-Path $TargetDir "CoStar-Codex"
if (-not (Test-Path $adapterTarget)) {
  New-Item -ItemType Directory -Force -Path $adapterTarget | Out-Null
}

foreach ($name in @("README.md", "tool-exposure.json", "sample-workflow.md", "TEST_PACK.md", "TEST_RESULTS_TEMPLATE.md", "MOCK_TRANSCRIPT.md")) {
  $sourcePath = Join-Path $adapterSource $name
  $targetPath = Join-Path $adapterTarget $name
  $content = Get-Content -Raw $sourcePath
  $content = $content.Replace("node costar-core/host-model-adapter/run-host-tool.mjs", "node `"$RepoRoot\\costar-core\\host-model-adapter\\run-host-tool.mjs`"")
  Write-Utf8NoBomFile -Path $targetPath -Content $content
}

$skillSource = Join-Path $adapterSource "costar\\SKILL.md"
$skillTarget = Join-Path $adapterTarget "SKILL.md"
$skillContent = Get-Content -Raw $skillSource
$skillContent = $skillContent.Replace("{{COSTAR_REPO_ROOT}}", $RepoRoot)
$skillContent = $skillContent.Replace("node costar-core/host-model-adapter/run-host-tool.mjs", "node `"$RepoRoot\\costar-core\\host-model-adapter\\run-host-tool.mjs`"")
Write-Utf8NoBomFile -Path $skillTarget -Content $skillContent

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
& node (Join-Path $RepoRoot "costar-core\\host-model-adapter\\render-host-prompt-packet.mjs") --host codex --output $promptPacketPath | Out-Null

$sessionProtocolPath = Join-Path $adapterTarget "SESSION_PROTOCOL.md"
& node (Join-Path $RepoRoot "costar-core\\host-model-adapter\\render-host-session-protocol.mjs") --host codex --output $sessionProtocolPath | Out-Null

Write-Host "Installed Codex adapter:"
Write-Host $adapterTarget
