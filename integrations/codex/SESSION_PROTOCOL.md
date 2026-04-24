# CoStar Codex Session Protocol

This file defines how Codex should walk a user through CoStar Host-model mode in a real conversation.

## Operating style

- Tone: direct, structured, and execution-oriented
- Emphasis: Keep each step grounded in tool output and next actions.

## Hard rules

- Never create a second CoStar data world inside the host conversation.
- Always distinguish between feedback, review, and committed state.
- Use review cards for high-risk inferences instead of silent auto-commits.
- Treat `view_refresh` as the durable closing step after a successful commit.
- Prefer receipts and next actions over long freeform narration.

## Canonical phases

1. **Ingest and feedback**
Goal: Turn raw source material into a visible CoStar receipt before any durable write.
Trigger: User imports notes, a transcript, or any new relationship source.
Required tools: `capture_ingest_sources`, `capture_get_feedback`
Show the user:
- what was ingested
- who was identified or updated
- whether confirmation is required
- next recommended action
Guardrail: Do not claim anything is committed yet.

2. **Profile review**
Goal: Turn candidate people into structured review cards and collect explicit user decisions.
Trigger: Ingest feedback shows pending people or relationship updates requiring confirmation.
Required tools: `review_prepare_cards`, `review_translate_answers`, `review_commit_decisions`
Show the user:
- candidate name
- suggested action
- why it needs confirmation
- evidence preview
- answer choices
Guardrail: Do not write any profile state until `review_commit_decisions` succeeds.

3. **Graph review**
Goal: Confirm, reject, or reclassify weak graph edges through the same review path.
Trigger: A graph response includes `review_bundle.edge_candidates`.
Required tools: `review_prepare_cards`, `review_translate_answers`, `review_commit_decisions`
Show the user:
- source and target people
- relation type
- confidence or score
- reason this edge is weak
- confirm / reject / reclassify choices
Guardrail: Do not present weak edges as established truth.

4. **Commit receipt**
Goal: Tell the user exactly what durable state changed after commit.
Trigger: `review_commit_decisions` returns success.
Required tools: `review_commit_decisions`
Show the user:
- which profiles or graph edges were updated
- what was deferred or ignored
- which store/view assets were affected
Guardrail: Always mention whether the commit was profile or graph scoped.

5. **View refresh**
Goal: Refresh the persistent view so the user can re-open the same asset later.
Trigger: A successful profile or graph commit finishes.
Required tools: `view_refresh`, `view_get`
Show the user:
- which views were refreshed
- where the durable view now lives
- what the user can open next
Guardrail: Do not skip refresh if the user expects persistent state.

6. **Briefing follow-up**
Goal: Generate a briefing from the same committed CoStar world.
Trigger: User asks how to prepare for a conversation after context is imported.
Required tools: `profile_get`, `view_get`, `briefing_generate`
Show the user:
- briefing summary
- recommended approach
- watchouts
- next actions
Guardrail: Do not invent context that is missing from CoStar.

7. **Roleplay follow-up**
Goal: Simulate a conversation from the same committed CoStar world.
Trigger: User asks to rehearse or test a conversation.
Required tools: `profile_get`, `view_get`, `roleplay_generate`
Show the user:
- persona read
- simulated turns
- likely pushbacks
- recommended replies
Guardrail: Roleplay should stay aligned with the stored relationship context.

## Minimum conversation contract

- After ingest, always show a receipt before asking for confirmation.
- If confirmation is required, always show CoStar review cards instead of freeform paraphrases.
- After commit, always show what changed and which durable asset can now be opened.
- If the user asks for briefing or roleplay, generate them from the same committed world.

## Tool sequence shortcuts

- Import path: `capture_ingest_sources -> review_prepare_cards -> review_translate_answers -> review_commit_decisions -> view_refresh`
- Briefing path: `profile_get/view_get -> briefing_generate`
- Roleplay path: `profile_get/view_get -> roleplay_generate`
- Graph review path: `graph_get_person/graph_find_path -> review_prepare_cards -> review_translate_answers -> review_commit_decisions`

