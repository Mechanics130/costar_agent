# CoStar Codex Test Pack

Use this pack when you want Codex to validate the current Host-model mode slice
without touching the public repo or inventing a second CoStar workflow.

## Read first

1. `README.md`
2. `PROMPT_PACKET.md`
3. `SESSION_PROTOCOL.md`
4. `tool-exposure.json`

## What Codex should verify

Codex should explicitly answer these four questions:

1. Does the user no longer need to configure a model API?
2. Can the user complete the full loop inside the host?
3. Do generated results enter the same CoStar store / schema / review system?
4. Has CoStar avoided splitting into two data worlds?

## Suggested validation order

### 0. Codex skill install path

Run:

```bash
node bin/costar.mjs host install codex --apply-skill
node bin/costar.mjs host doctor codex
```

What to verify:

- no model API key, model name, or base URL is requested
- the installed skill path is `costar/SKILL.md`
- the installed skill points back to the same local CoStar repo
- Codex can load the skill after the skills directory is refreshed

### 1. Bridge and host-reasoning path

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

### 2. Review protocol path

Run:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-prepare.profile.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-translate.profile.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-prepare.graph.request.example.json
node costar-core/host-model-adapter/run-host-tool.mjs costar-core/host-model-adapter/samples/review-translate.graph.request.example.json
```

What to verify:

- Codex does not need to invent review card shapes
- Codex does not need to invent commit payloads
- profile review and graph review both end in the same commit contract

### 3. End-to-end local slice

Run:

```bash
node costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs
```

What to verify:

- the flow covers capture -> review -> commit -> view
- the same slice also reaches briefing and roleplay
- committed state is later read back from the same store world

## Deliverable

After testing, fill in `TEST_RESULTS_TEMPLATE.md` with:

- pass / fail for each hard acceptance question
- any place where Codex still had to invent protocol behavior
- any place where host-mode still feels like a second system
