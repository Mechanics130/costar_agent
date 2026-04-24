# CoStar Claude Test Requirements

This document defines exactly what Claude should test, what files are in scope,
what commands are allowed, and what counts as a pass for the current
Host-model mode slice.

## 1. Test objective

Claude is not being asked to review the whole repository.

Claude is being asked to validate one specific thing:

> Whether the current local Host-model mode slice is ready for the first real
> Claude-side test without creating a second CoStar data world.

## 2. In-scope files

Claude should focus on these files first:

### Claude adapter surface

- `integrations/claude/README.md`
- `integrations/claude/QUICKSTART.md`
- `integrations/claude/FIRST_SESSION.md`
- `integrations/claude/PROMPT_PACKET.md`
- `integrations/claude/SESSION_PROTOCOL.md`
- `integrations/claude/TEST_PACK.md`
- `integrations/claude/TEST_RESULTS_TEMPLATE.md`
- `integrations/claude/MOCK_TRANSCRIPT.md`
- `integrations/claude/tool-exposure.json`
- `integrations/claude/claude-desktop.mcp.json`
- `integrations/claude/claude-code.mcp.json`
- `integrations/claude/manifest.json`
- `integrations/claude/install-claude-config.ps1`
- `integrations/claude/doctor-claude-install.mjs`

### Claude-native entrypoint

- `costar-core/mcp/costar-mcp-server.mjs`
- `costar-core/mcp/mcp-smoke.mjs`
- `costar-core/mcp/claude-bootstrap-smoke.mjs`
- `costar-core/mcp/claude-config-install-smoke.mjs`
- `costar-core/mcp/claude-clean-install-smoke.mjs`

### Shared host-model bridge

- `costar-core/host-model-adapter/run-host-tool.mjs`
- `costar-core/host-model-adapter/review-protocol.mjs`
- `costar-core/host-model-adapter/samples/*.json`
- `costar-core/host-model-adapter/claude-test-pack-smoke.mjs`
- `costar-core/host-model-adapter/host-adapter-smoke.mjs`
- `costar-core/host-model-adapter/review-protocol-smoke.mjs`

### End-to-end validation

- `costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs`
- `costar-core/host-model-e2e/host-model-e2e-checklist.md`

### Core contract / dispatcher layer

- `costar-core/tools/tool-contract.mjs`
- `costar-core/tools/host-model-dispatcher.mjs`
- `costar-core/commit/costar-commit.mjs`

## 3. Out-of-scope files

Claude does **not** need to audit these areas for this round:

- the public repo polish work
- general docs quality outside the Claude host path
- old web prototype / product shell code
- Cursor / OpenClaw adapters
- production MCP packaging
- domain / email / launch copy issues
- global architecture decisions already recorded in planning docs

If Claude finds a serious blocker outside this scope, it can mention it briefly,
but should not let that derail the Host-model acceptance test.

## 4. Allowed commands

Claude should prefer this exact sequence:

### 4.1 Read the test surface

- open `README.md`
- open `PROMPT_PACKET.md`
- open `SESSION_PROTOCOL.md`
- open `TEST_PACK.md`
- open `TEST_RESULTS_TEMPLATE.md`

### 4.2 Run the required commands

```bash
node bin/costar.mjs host install claude --apply-config
node bin/costar.mjs host doctor claude
node .costar-hosts/CoStar-Claude/doctor-claude-install.mjs --require-config
node costar-core/host-install/host-installer-smoke.mjs
node costar-core/mcp/mcp-smoke.mjs
node costar-core/mcp/claude-bootstrap-smoke.mjs
node costar-core/mcp/claude-config-install-smoke.mjs
node costar-core/mcp/claude-clean-install-smoke.mjs
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/capture-ingest.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/briefing-generate.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/roleplay-generate.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-prepare.profile.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-translate.profile.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-prepare.graph.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-translate.graph.request.example.json
node costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs
node costar-core/host-model-adapter/claude-test-pack-smoke.mjs
node costar-core/host-model-adapter/host-adapter-smoke.mjs
node costar-core/host-model-adapter/review-protocol-smoke.mjs
```

Optional final confidence check:

```bash
npm test
```

## 5. What Claude must evaluate

Claude should answer the four hard acceptance questions, using evidence from
the files and command outputs above.

### Hard acceptance question 1

**Does the user no longer need to configure a model API?**

Pass means:

- the Claude path assumes host-side reasoning instead of external API config
- the Claude test surface does not require a separate model config file
- nothing in the flow depends on `base_url / api_key / model` setup by the user
- the Claude-native MCP config and bootstrap path also avoid separate model API prompts
- the optional Claude config install path also avoids separate model API prompts
- the clean-install bundle remains usable without forcing the user back into repo-internal setup steps
- the installed Claude bundle can self-verify from inside the bundle, not only through repo-root commands

### Hard acceptance question 2

**Can the user complete the full loop inside the host?**

Pass means Claude can trace a real path for:

- import
- feedback
- review
- commit
- view refresh
- briefing or roleplay follow-up

### Hard acceptance question 3

**Do generated results enter the same store / schema / review system?**

Pass means:

- review goes through `review_prepare_cards -> review_translate_answers -> review_commit_decisions`
- durable writes still land through canonical CoStar commit paths
- downstream reads come from the same profile / graph / view world

### Hard acceptance question 4

**Has CoStar avoided splitting into two data worlds?**

Pass means:

- Claude is only the reasoning and orchestration layer
- CoStar remains the durable system of record
- the protocol never asks Claude to maintain its own persistent relationship state

## 6. Evidence standard

Claude should not answer with general impressions only.

Each pass / fail judgment should cite at least one of:

- a file reference
- a command output
- a concrete protocol step
- a mismatch between expected and actual behavior

## 7. Deliverable format

Claude should record results using:

- `integrations/claude/TEST_RESULTS_TEMPLATE.md`

The output should contain:

- pass / fail for the four hard questions
- tool-path observations
- friction or ambiguity
- recommended next fixes

## 8. Non-goals for this round

Claude does not need to prove:

- production readiness
- final UX polish
- public repo launch readiness
- Cursor compatibility
- OpenClaw compatibility
- full MCP packaging

This round only checks whether the current Claude Host-model slice is
structurally testable and architecturally sound.
