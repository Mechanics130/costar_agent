# CoStar Codex Host-model Skill Adapter

This folder packages CoStar for Codex Host-model mode.

Codex supplies the model reasoning and orchestration.
CoStar supplies the durable stores, schemas, review / commit path, graph, view, briefing, and roleplay contracts.

Host-model mode should not ask the user for a separate CoStar model API key.

## What This Adapter Provides

- a discoverable Codex skill entrypoint: `costar/SKILL.md`
- the same stable local bridge command as Claude and OpenClaw
- a tool exposure manifest
- a Codex session protocol for the user-facing loop
- a Codex-specific test pack and result template
- a realistic mock transcript for review and commit behavior
- host-reasoning samples for capture / briefing / roleplay
- cross-platform installation on Windows and macOS through the Node installer

## Layout

```text
integrations/codex/
  README.md
  bootstrap-codex.ps1 (legacy Windows helper)
  costar/SKILL.md
  PROMPT_PACKET.md
  SESSION_PROTOCOL.md
  TEST_PACK.md
  TEST_RESULTS_TEMPLATE.md
  MOCK_TRANSCRIPT.md
  tool-exposure.json
  sample-workflow.md
```

## Local Bridge Command

Codex-side integrations should eventually call:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs <request.json>
```

Sample requests that already work locally:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/capture-ingest.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/briefing-generate.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/roleplay-generate.request.example.json
```

## Fastest Local Install Path

From the repo root:

```bash
node bin/costar.mjs host install codex --apply-skill
node bin/costar.mjs host doctor codex
```

This installs the `costar` skill into the default Codex skills directory:

- Windows: `%USERPROFILE%\.codex\skills\costar`
- macOS: `~/.codex/skills/costar`

To install into a custom skills directory:

```bash
node bin/costar.mjs host install codex --codex-skills-dir <codex-skills-dir>
```

To install a ready-to-inspect bundle without touching the active Codex skills directory:

```bash
node bin/costar.mjs host install codex --target-dir <host-tools-dir>
```

## Host Responsibilities

Codex should handle:

- interpreting the user's request
- sequencing CoStar tools
- collecting user confirmation when needed
- supplying host reasoning for tools marked `requires_host_reasoning`

CoStar should handle:

- deterministic reads
- durable writes through review / commit
- persistent views

## Status

Local Codex skill adapter with install bundle and smoke tests. It is ready for local Codex-style host-loop validation on Windows and macOS, but still needs real Codex product-environment validation before broad release.
