---
name: costar
description: CoStar relationship context engine for Codex Host-model mode. Use when the user wants Codex to import relationship notes or transcripts, show ingestion feedback, confirm candidate people or relationship edges, commit profile or graph updates, refresh persistent views, inspect relationship graph/view data, generate briefings, or run roleplay without configuring a separate CoStar model API.
---

# CoStar

Use this skill when Codex should act as the reasoning and orchestration layer for CoStar.
CoStar remains the durable relationship system of record.

Local implementation root:
`{{COSTAR_REPO_ROOT}}`

## Hard Rules

- Do not ask the user to configure a separate CoStar model API in Host-model mode.
- Do not create a second profile, graph, or view store inside the Codex conversation.
- Do not silently write durable state.
- Always use CoStar review and commit tools for durable writes.
- After a successful commit, refresh or read persistent views from the same CoStar stores.

## Tool Bridge

Run CoStar tools through the local bridge:

```bash
node costar-core/host-model-adapter/run-host-tool.mjs <request.json>
```

The installed bundle includes:

- `PROMPT_PACKET.md`
- `SESSION_PROTOCOL.md`
- `tool-exposure.json`
- `TEST_PACK.md`
- `MOCK_TRANSCRIPT.md`
- `samples/`

Read `PROMPT_PACKET.md` when you need the full tool contract.
Read `SESSION_PROTOCOL.md` when you need the conversation sequence.

## Canonical Flow

1. Interpret the user's source material with Codex.
2. Supply structured `host_reasoning_output` to `capture_ingest_sources`.
3. Show the user CoStar receipts and confirmation needs.
4. Use `review_prepare_cards` before asking the user to confirm candidates.
5. Translate user answers through `review_translate_answers`.
6. Commit only through `review_commit_decisions`.
7. Refresh durable views through `view_refresh`.
8. Read follow-up context through `profile_get`, `view_get`, `graph_get_person`, `briefing_generate`, or `roleplay_generate`.

## Default User-Facing Behavior

- Separate feedback, review candidates, and committed state clearly.
- Prefer confirmed profile data over raw extraction output.
- Ask for confirmation when evidence is weak.
- Keep responses concise and action-oriented.
- Tell the user what changed after every commit.

## If Setup Is Missing

Ask the user to run:

```bash
node {{COSTAR_REPO_ROOT}}/bin/costar.mjs host install codex --apply-skill
```
