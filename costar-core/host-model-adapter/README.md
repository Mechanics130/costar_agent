# CoStar Host-model Adapter Bridge

This directory contains the first executable bridge between host adapters and
the local CoStar tool layer.

Current entrypoint:

- `run-host-tool.mjs`
- `render-host-prompt-packet.mjs`
- `review-protocol.mjs`

Usage:

```powershell
node costar-core/host-model-adapter/run-host-tool.mjs path\to\request.json
```

```powershell
node costar-core/host-model-adapter/render-host-prompt-packet.mjs --host claude
node costar-core/host-model-adapter/render-host-prompt-packet.mjs --host codex --output integrations\codex\PROMPT_PACKET.md
```

```powershell
node costar-core/host-model-adapter/review-protocol-smoke.mjs
```

Request format:

```json
{
  "tool_name": "profile_get",
  "tool_input": {
    "person_name": "Ava Chen",
    "profile_store_path": "relationship-ingestion/runtime/stores/relationship-profile-store.json"
  }
}
```

Current scope:

- deterministic/read tools
- unified commit path
- host-reasoning workflows for:
  - `capture_ingest_sources`
  - `briefing_generate`
  - `roleplay_generate`
- host review protocol for:
  - profile review candidates
  - graph edge review candidates
- generated host prompt packets for Claude / Codex

This adapter layer now does two things:

- gives hosts a stable local bridge
- gives hosts a consistent orchestration packet so they do not invent a second CoStar workflow

It also defines the host review protocol behind two deterministic tools:

- `review_prepare_cards`
  - turns a capture or graph result into prompt cards that the host can show to a user
- `review_translate_answers`
  - turns host-side review answers into the canonical `review_commit_decisions` payload

Sample files:

- `samples/capture-ingest.request.example.json`
- `samples/briefing-generate.request.example.json`
- `samples/roleplay-generate.request.example.json`
- `samples/review-protocol.profile-input.example.json`
- `samples/review-protocol.profile-answer.example.json`
- `samples/review-protocol.graph-input.example.json`
- `samples/review-protocol.graph-answer.example.json`
