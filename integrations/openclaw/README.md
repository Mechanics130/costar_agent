# CoStar OpenClaw Host-model Adapter

This folder packages CoStar for OpenClaw-style hosts.

The goal is different from the older Engine-mode adapter:

- OpenClaw supplies the host model and orchestration.
- CoStar supplies tools, stores, review / commit, graph, view, and durable truth.
- Users should not need to configure a separate CoStar model API.
- The installer works through Node.js on Windows and macOS.

## Fastest Local Install Path

From the repo root:

```bash
node bin/costar.mjs host install openclaw
node bin/costar.mjs host doctor openclaw
```

For a full local claw validation, use:

- `LOCAL_CLAW_TEST_GUIDE.md`

If you want to install directly into an OpenClaw skills directory:

```bash
node bin/costar.mjs host install openclaw --openclaw-skills-dir <openclaw-skills-dir>
```

This creates:

```text
<openclaw-skills-dir>/CoStar/
  SKILL.md
  PROMPT_PACKET.md
  SESSION_PROTOCOL.md
  TEST_PACK.md
  TEST_RESULTS_TEMPLATE.md
  MOCK_TRANSCRIPT.md
  tool-exposure.json
  sample-workflow.md
  samples/
```

## Local Bridge Command

OpenClaw should route durable CoStar operations through:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs <request.json>
```

Sample requests:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/capture-ingest.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-prepare.profile.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-translate.profile.request.example.json
node costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs
```

## Host Responsibilities

OpenClaw should handle:

- user intent understanding
- source reading and host-side reasoning
- sequencing CoStar tools
- collecting user confirmation
- showing receipts and next actions

CoStar should handle:

- canonical stores
- schemas
- review / commit
- profile / graph / view deterministic logic
- durable artifacts

## Non-goals

This adapter does not create `relationship-ingestion/runtime/model-config.local.json`.
That is intentional. Host-model mode should not ask the user for `base_url`, `api_key`, or `model`.

## Status

Local host-model adapter with install bundle and smoke tests. It is ready for local OpenClaw-style host-loop validation on Windows and macOS, but still needs real OpenClaw product-environment validation.
