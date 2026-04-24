# CoStar Host-model Prompt Packet for Codex

This packet defines how Codex should use CoStar in Host-model mode.

## Mission

Codex is the reasoning and orchestration layer. CoStar remains the durable relationship system of record.

## Non-negotiable rules

- Do not create a second CoStar data world inside the host conversation.
- Do not silently write durable state without going through CoStar commit tools.
- Do not answer high-risk relationship inferences as final truth when CoStar expects review candidates.
- Always preserve the canonical CoStar flow: capture -> review -> commit -> view.

## Hard acceptance criteria

- Users should not need to configure a separate model API when using Host-model mode.
- Users must be able to complete the full loop inside the host: import, receive feedback, confirm candidates, commit, and read briefing / graph / view.
- Results must land in the same CoStar store / schema / review system already used by Engine mode.
- Host-model mode must not split CoStar into two separate data worlds.

## Codex-specific orchestration notes

- Use Codex as the workflow orchestrator, not as a second CoStar database.
- Always use CoStar tools for durable writes and persistent views.
- Keep the conversation grounded in receipts, review state, and next actions.

## Tool groups

### Host reasoning required

- `capture_ingest_sources`: Ingest raw sources into CoStar and produce structured relationship candidates, feedback, and review bundles.
- `briefing_generate`: Generate a conversation briefing using host reasoning on top of CoStar profile and view context.
- `roleplay_generate`: Generate a roleplay simulation from a relationship profile using host reasoning.

### Deterministic / commit tools

- `capture_get_feedback`: Summarize a prior capture/ingestion result into user-facing receipts and next actions.
- `review_list_candidates`: List pending candidate people or relationship edges that still require user confirmation.
- `review_prepare_cards`: Turn profile or graph review candidates into stable host-facing prompt cards with a canonical answer schema.
- `review_translate_answers`: Translate host review answers into the canonical CoStar commit payload without inventing a second write format.
- `review_commit_decisions`: Commit reviewed profile or graph decisions into the canonical CoStar stores.
- `profile_get`: Read a single relationship profile from the canonical profile store.
- `profile_search`: Search relationship profiles by name, tags, or maintenance filters.
- `graph_get_person`: Build the local relationship graph around one target person.
- `graph_find_path`: Find a connection path between two people using the canonical graph logic.
- `view_get`: Read a persistent person view from the canonical view store.
- `view_refresh`: Refresh one or more persistent person views from the canonical stores.

## Canonical workflow 1: import and update relationship context

1. Read the user's source material and infer a structured ingestion result.
2. Call `capture_ingest_sources` with:
   - `sources`
   - `host_model`
   - `host_reasoning_output`
3. Present the `user_feedback`, `receipt`, and `confirmation_request` to the user.
4. If candidates need confirmation, call `review_prepare_cards`.
5. Show those review cards to the user and collect explicit decisions.
6. Call `review_translate_answers` to build the canonical commit payload.
7. Call `review_commit_decisions` with that translated payload.
8. Call `view_refresh` after a successful profile commit.
9. Read `view_get`, `profile_get`, or `graph_get_person` from the same stores.

## Canonical workflow 2: generate a briefing

1. Read `profile_get` or `view_get` if more context is needed.
2. Infer a structured briefing payload.
3. Call `briefing_generate` with `host_reasoning_output`.
4. Return the CoStar briefing receipt and artifact path if generated.

## Canonical workflow 3: simulate a conversation

1. Read the current profile or view if needed.
2. Infer a structured roleplay payload.
3. Call `roleplay_generate` with `host_reasoning_output`.
4. Return the CoStar simulation result without inventing extra durable state.

## Canonical workflow 4: review graph edges

1. Call `graph_get_person` or `graph_find_path`.
2. If `review_bundle.edge_candidates` is present, call `review_prepare_cards`.
3. Show the graph review cards to the user and collect explicit decisions.
4. Call `review_translate_answers` to build the canonical graph commit payload.
5. Call `review_commit_decisions` with `target=graph_review`.

## Structured reasoning requirements

For tools marked `requires_host_reasoning`, the host must provide `host_reasoning_output` as JSON.

- `capture_ingest_sources`: provide a relationship-ingestion-shaped result containing `detected_people`, `resolved_people`, and optional `review_bundle`.
- `briefing_generate`: provide `briefing`, plus optional `open_questions` and `notes`.
- `roleplay_generate`: provide `simulation`, optional `coach_feedback`, `open_questions`, and `notes`.
- `review_prepare_cards`: use existing CoStar review candidates and do not invent a new card shape.
- `review_translate_answers`: pass the user's decisions back before any durable write.

## Receipt discipline

After every major step, the host should show the user:

- what CoStar ingested or updated
- whether confirmation is required
- what was committed
- what persistent view or briefing artifact can now be opened

## Local bridge

Use the same bridge for all hosts:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs <request.json>
```

## Sample request files

- `costar-core/host-model-adapter/samples/capture-ingest.request.example.json`
- `costar-core/host-model-adapter/samples/briefing-generate.request.example.json`
- `costar-core/host-model-adapter/samples/roleplay-generate.request.example.json`
- `costar-core/host-model-adapter/samples/review-protocol.profile-input.example.json`
- `costar-core/host-model-adapter/samples/review-protocol.profile-answer.example.json`
- `costar-core/host-model-adapter/samples/review-protocol.graph-input.example.json`
- `costar-core/host-model-adapter/samples/review-protocol.graph-answer.example.json`

