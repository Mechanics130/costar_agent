# OpenClaw Sample Workflow

## Goal

Validate that OpenClaw can act as the host reasoning layer while CoStar remains the durable relationship system of record.

## Example flow

1. User asks OpenClaw to import a meeting note.
2. OpenClaw reads the note and prepares `host_reasoning_output`.
3. OpenClaw calls `capture_ingest_sources`.
4. CoStar returns receipts, feedback, and review candidates.
5. OpenClaw calls `review_prepare_cards`.
6. User confirms, defers, or rejects candidates.
7. OpenClaw calls `review_translate_answers`.
8. OpenClaw calls `review_commit_decisions`.
9. OpenClaw calls `view_refresh`.
10. OpenClaw reads `view_get`, `profile_get`, or `graph_get_person`.

For preparation flows:

11. OpenClaw reads current profile/view context.
12. OpenClaw supplies host reasoning to `briefing_generate` or `roleplay_generate`.
13. CoStar materializes the result without creating a second data world.

## Success condition

OpenClaw never asks the user for a separate model API, and all durable writes land in CoStar review / commit.
