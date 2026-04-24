# CoStar Claude Test Pack

Use this pack when you want Claude to validate the current Host-model mode slice
without touching the public repo or inventing a second CoStar workflow.

## Read first

1. `README.md`
2. `PROMPT_PACKET.md`
3. `SESSION_PROTOCOL.md`
4. `TEST_REQUIREMENTS.md`
5. `tool-exposure.json`
6. `claude-desktop.mcp.json` / `claude-code.mcp.json`

## What Claude should verify

Claude should explicitly answer these four questions:

1. Does the user no longer need to configure a model API?
2. Can the user complete the full loop inside the host?
3. Do generated results enter the same CoStar store / schema / review system?
4. Has CoStar avoided splitting into two data worlds?

## Suggested validation order

### 1. Claude-native entrypoint and install skeleton

Run:

```bash
node bin/costar.mjs host install claude --apply-config
node bin/costar.mjs host doctor claude
node .costar-hosts/CoStar-Claude/doctor-claude-install.mjs --require-config
node costar-core/mcp/mcp-smoke.mjs
node costar-core/host-install/host-installer-smoke.mjs
node costar-core/mcp/claude-bootstrap-smoke.mjs
node costar-core/mcp/claude-config-install-smoke.mjs
node costar-core/mcp/claude-clean-install-smoke.mjs
```

What to verify:

- the user has a single CoStar entrypoint for Claude install and validation
- the local MCP server initializes and lists CoStar tools
- the Claude config templates point at the same local CoStar MCP server
- bootstrap installs a usable Claude adapter folder without asking for model API config
- the optional config step can wire Claude Desktop / Claude Code without asking for model API config
- a clean install bundle can configure Claude and start the installed MCP path without relying on repo-internal docs
- the installed bundle can self-verify with its own local doctor script

### 2. Bridge and host-reasoning path

Run:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/capture-ingest.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/briefing-generate.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/roleplay-generate.request.example.json
```

What to verify:

- host reasoning is accepted
- results are materialized into canonical CoStar response shapes
- output is marked as `host_model_adapter`, not a second store system

### 3. Review protocol path

Run:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-prepare.profile.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-translate.profile.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-prepare.graph.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-translate.graph.request.example.json
```

What to verify:

- Claude does not need to invent review card shapes
- Claude does not need to invent commit payloads
- profile review and graph review both end in the same commit contract

### 4. End-to-end local slice

Run:

```bash
node costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs
```

What to verify:

- the flow covers capture -> review -> commit -> view
- the same slice also reaches briefing and roleplay
- committed state is later read back from the same store world

### 5. First-session guidance

Inspect:

```bash
cat integrations/claude/FIRST_SESSION.md
```

What to verify:

- the installed bundle gives the user a shortest-path first-session prompt
- the first-session prompt does not require JSON authoring
- the first-session guidance still routes commit actions through CoStar review / commit tools

## Deliverable

After testing, fill in `TEST_RESULTS_TEMPLATE.md` with:

- pass / fail for each hard acceptance question
- any place where Claude still had to invent protocol behavior
- any place where host-mode still feels like a second system
