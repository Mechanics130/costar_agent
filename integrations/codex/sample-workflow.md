# Codex Sample Workflow

## Goal

Demonstrate how the Codex Host-model skill adapter should use CoStar tools without
inventing its own data writes.

## Example flow

1. User asks for a briefing before a relationship conversation.
2. Codex reads `profile_get` or `view_get`.
3. If a recent note should be imported first, Codex prepares host reasoning and calls `capture_ingest_sources`.
4. Codex calls `review_prepare_cards`.
5. Codex shows the resulting feedback and review candidates.
6. User confirms the candidates.
7. Codex calls `review_translate_answers`.
8. Codex calls `review_commit_decisions`.
9. Codex refreshes the persistent view.
10. Codex prepares host reasoning and calls `briefing_generate`.
11. If the user wants to rehearse the conversation, Codex prepares host reasoning and calls `roleplay_generate`.

For graph review:

12. Codex calls `graph_get_person` or `graph_find_path`.
13. If the result contains `review_bundle.edge_candidates`, Codex calls `review_prepare_cards`.
14. User confirms, rejects, or reclassifies the edge.
15. Codex calls `review_translate_answers`.
16. Codex calls `review_commit_decisions` with `target=graph_review`.

## Success condition

The resulting profile, graph, and view stay inside the canonical CoStar stores.
