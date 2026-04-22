# CoStar OpenClaw Adapter

This folder packages the minimal installation layer for OpenClaw users.

## What we take over

The adapter is meant to reduce user setup work by handling:
- local model config creation
- OpenClaw skill wrapper installation
- install verification
- sample skill entrypoint wiring

## What still remains user-specific

Users still need to provide:
- their OpenAI-compatible model endpoint
- their API key
- their real data for validation

## Layout

```text
integrations/openclaw/
  README.md
  bootstrap-costar.ps1
  CoStar/
    README.md
    SKILL.md
```

## Quick start

```powershell
powershell -ExecutionPolicy Bypass -File integrations\openclaw\bootstrap-costar.ps1 `
  -RepoRoot . `
  -OpenClawSkillsDir C:\OpenClaw\skills `
  -BaseUrl https://api.example.com/v1 `
  -Model example-model `
  -ApiKey YOUR_API_KEY
```

If `-OpenClawSkillsDir` is omitted, the script will still create the local model config and print the exact files that were installed.
