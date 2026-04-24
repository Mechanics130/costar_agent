# Claude Sample Workflow

## Goal

Show the future Claude adapter flow without inventing a second CoStar data
world.

## Example flow

1. User says: import this meeting note and update Yanran.
2. Claude reads the raw source and prepares host reasoning for `capture_ingest_sources`.
3. Claude calls `capture_ingest_sources` with:
   - `sources`
   - `host_model`
   - `host_reasoning_output`
4. Claude receives:
   - receipt
   - processing feedback
   - confirmation request
5. Claude calls `review_prepare_cards`.
6. Claude presents those cards to the user, without inventing a custom answer shape.
7. User confirms some people and defers others.
8. Claude calls `review_translate_answers`.
9. Claude calls `review_commit_decisions` with `target=profile_review`.
10. Claude calls `view_refresh`.
11. Claude reads `view_get` or `graph_get_person` for the updated person.

For preparation flows:

12. Claude supplies host reasoning to `briefing_generate` or `roleplay_generate`.
13. CoStar materializes the result into the same schema and artifact world used by Engine mode.

For graph review flows:

14. Claude gets a graph result with `review_bundle.edge_candidates`.
15. Claude calls `review_prepare_cards`.
16. User confirms, rejects, or downgrades edges.
17. Claude calls `review_translate_answers`.
18. Claude calls `review_commit_decisions` with `target=graph_review`.

## Success condition

All durable changes land in the same CoStar stores already used by Engine mode.
