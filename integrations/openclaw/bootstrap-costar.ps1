param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$TargetDir = "",
  [string]$OpenClawSkillsDir = "",
  [switch]$SkipSmoke
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

$RepoRoot = (Resolve-Path $RepoRoot).Path

$adapterSource = Join-Path $RepoRoot "integrations\openclaw"
if (-not (Test-Path $adapterSource)) {
  throw "OpenClaw adapter source not found: $adapterSource"
}

if ($OpenClawSkillsDir) {
  $adapterTarget = Join-Path $OpenClawSkillsDir "CoStar"
}
elseif ($TargetDir) {
  $adapterTarget = Join-Path $TargetDir "CoStar-OpenClaw"
}
else {
  Write-Host "No TargetDir or OpenClawSkillsDir provided. OpenClaw adapter remains in-place:"
  Write-Host $adapterSource
  exit 0
}

if (-not (Test-Path $adapterTarget)) {
  New-Item -ItemType Directory -Force -Path $adapterTarget | Out-Null
}

$coreFiles = @(
  "README.md",
  "PROMPT_PACKET.md",
  "SESSION_PROTOCOL.md",
  "LOCAL_CLAW_TEST_GUIDE.md",
  "TEST_PACK.md",
  "TEST_RESULTS_TEMPLATE.md",
  "MOCK_TRANSCRIPT.md",
  "tool-exposure.json",
  "sample-workflow.md"
)

foreach ($name in $coreFiles) {
  $sourcePath = Join-Path $adapterSource $name
  $targetPath = Join-Path $adapterTarget $name
  $content = Get-Content -Raw $sourcePath
  $content = $content.Replace("node costar-core/host-model-adapter/run-host-tool.mjs", "node `"$RepoRoot\costar-core\host-model-adapter\run-host-tool.mjs`"")
  $content = $content.Replace("{{COSTAR_REPO_ROOT}}", $RepoRoot)
  Write-Utf8NoBomFile -Path $targetPath -Content $content
}

$skillSource = Join-Path $adapterSource "CoStar\SKILL.md"
$skillTarget = Join-Path $adapterTarget "SKILL.md"
$skillContent = Get-Content -Raw $skillSource
$skillContent = $skillContent.Replace("{{COSTAR_REPO_ROOT}}", $RepoRoot)
$skillContent = $skillContent.Replace("node costar-core/host-model-adapter/run-host-tool.mjs", "node `"$RepoRoot\costar-core\host-model-adapter\run-host-tool.mjs`"")
Write-Utf8NoBomFile -Path $skillTarget -Content $skillContent

$sampleTarget = Join-Path $adapterTarget "samples"
if (-not (Test-Path $sampleTarget)) {
  New-Item -ItemType Directory -Force -Path $sampleTarget | Out-Null
}

$sampleSource = Join-Path $RepoRoot "costar-core\host-model-adapter\samples"
Get-ChildItem -Path $sampleSource -File | ForEach-Object {
  $targetPath = Join-Path $sampleTarget $_.Name
  $content = Get-Content -Raw $_.FullName
  Write-Utf8NoBomFile -Path $targetPath -Content $content
}

$promptPacketPath = Join-Path $adapterTarget "PROMPT_PACKET.md"
& node (Join-Path $RepoRoot "costar-core\host-model-adapter\render-host-prompt-packet.mjs") --host openclaw --output $promptPacketPath | Out-Null

$sessionProtocolPath = Join-Path $adapterTarget "SESSION_PROTOCOL.md"
& node (Join-Path $RepoRoot "costar-core\host-model-adapter\render-host-session-protocol.mjs") --host openclaw --output $sessionProtocolPath | Out-Null

if (-not $SkipSmoke) {
  Push-Location $RepoRoot
  try {
    node costar-core\host-model-adapter\openclaw-test-pack-smoke.mjs
    node costar-core\host-model-e2e\runtime\host-model-e2e-smoke.mjs
  }
  finally {
    Pop-Location
  }
}

Write-Host "Installed OpenClaw host-model adapter:"
Write-Host $adapterTarget
