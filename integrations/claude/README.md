# CoStar Claude Adapter Skeleton

This folder is the Phase 1 skeleton for running CoStar in Host-model mode inside Claude-family products.

## What This Skeleton Does Today

- documents the intended Claude-side integration shape
- exposes a stable local CoStar bridge command
- exposes a local MCP server entrypoint for Claude-native installs
- provides a tool exposure manifest
- provides Claude Desktop / Claude Code config templates
- provides a sample workflow for a future Claude adapter
- provides a session protocol for the user-facing conversation loop
- provides a Claude-specific test pack and result template
- provides a realistic mock transcript for host-side review and commit behavior
- provides a dedicated test requirements document that defines scope and acceptance criteria
- includes host-reasoning samples for capture / briefing / roleplay
- installs through the cross-platform Node host installer on Windows and macOS

## What It Does Not Do Yet

- it does not yet complete a true Claude conversation loop by itself
- it does not yet replace final product-environment validation inside every Claude-family host

The goal is to avoid inventing a second CoStar world before the real adapter exists.

## Layout

```text
integrations/claude/
  README.md
  QUICKSTART.md
  FIRST_SESSION.md
  FINAL_USER_ACCEPTANCE.md
  FINAL_USER_RESULTS_TEMPLATE.md
  bootstrap-claude.ps1 (legacy Windows helper)
  claude-desktop.mcp.json
  claude-code.mcp.json
  manifest.json
  install-claude-config.ps1 (legacy Windows helper)
  install-claude-config.mjs
  doctor-claude-install.mjs
  PROMPT_PACKET.md
  SESSION_PROTOCOL.md
  TEST_REQUIREMENTS.md
  TEST_PACK.md
  TEST_RESULTS_TEMPLATE.md
  MOCK_TRANSCRIPT.md
  tool-exposure.json
  sample-workflow.md
```

## Local Bridge Command

Claude-side integrations should eventually call the same local bridge:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs <request.json>
```

Sample requests that already work locally:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/capture-ingest.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/briefing-generate.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/roleplay-generate.request.example.json
```

## Local MCP Server

Claude-native installs can now point at this local MCP server:

```bash
node integrations/claude/run-costar-mcp.mjs
```

The shipped Claude config templates and install script point to the bundle-local `run-costar-mcp.mjs`, which in turn resolves the durable CoStar repo.

## Fastest Local Install Path

From the repo root:

```bash
node bin/costar.mjs host install claude
node bin/costar.mjs host doctor claude
```

This installs a ready-to-inspect Claude adapter bundle under the default host-install directory and then verifies:

- the local MCP server can initialize
- the Claude config templates point at the same CoStar MCP server
- bootstrap produces a usable local install without asking for model API config

If you also want CoStar to wire your local Claude Desktop and Claude Code config automatically, use:

```bash
node bin/costar.mjs host install claude --apply-config
```

That keeps the same local CoStar MCP server path but writes it into:

- Claude Desktop config
- repo-root `.mcp.json` for Claude Code

Default Claude Desktop config paths:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

If you want the shortest human-facing path after bootstrap, open:

- `QUICKSTART.md`
- `FIRST_SESSION.md`
- `FINAL_USER_ACCEPTANCE.md`

## Included Claude Config Templates

- `claude-desktop.mcp.json`
- `claude-code.mcp.json`
- `manifest.json`

## Host Responsibilities

Claude should handle:

- user intent understanding
- tool selection
- multi-step orchestration
- conversational clarification
- supplying host reasoning for tools marked `requires_host_reasoning`

CoStar should continue to handle:

- stores
- schemas
- review / commit
- graph / view / profile deterministic logic

## Status

Phase 1.5 skeleton plus a working local host-reasoning bridge, local MCP entrypoint, and cross-platform Node installer. Real Claude product-environment validation is still required before broad release.
