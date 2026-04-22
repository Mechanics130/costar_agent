# Relationship Capture Skill

`relationship-capture` is the most user-facing layer in the CoStar skill
system.

It does not perform the low-level extraction by itself. Instead, it orchestrates:

- `relationship-ingestion`
- `relationship-review-resolution`

It solves three user-facing problems:

1. after the user imports material, the system should immediately say what it
   received
2. after extraction, the system should clearly say what it found and what still
   needs confirmation
3. after the user confirms the results, the system should clearly say who was
   created and who was updated

## Current capability

This version supports two main chains:

1. `sources -> ingestion -> user feedback`
   - accept source material
   - automatically call `relationship-ingestion`
   - return `receipt / processing_feedback / confirmation_request / next_action / user_feedback`

2. `ingestion_result + review_decisions -> commit feedback`
   - accept extraction results and user confirmation decisions
   - automatically call `relationship-review-resolution`
   - return `commit_feedback / next_action / user_feedback`

## Automatic context recall

As of 2026-04-19, `relationship-capture` includes automatic context recall:

- users no longer need to manually pass a full `existing_people` list
- the skill first tries to recall relevant people from the existing profile store
- it then injects those people into `relationship-ingestion`

Current recall strategy:

- prefer matches from `focus_people`
- then try `target_people`
- then check whether the source material directly mentions the person
- recall results are written into `receipt`

The following values are returned as well:

- `auto_context_applied`
- `auto_context_added_count`
- `auto_context_matched_people`
- `auto_context_store_count`

This layer is not meant to replace `person-resolution`. Its goal is to attach
existing relationship memory whenever possible so that a single meeting note or
batch import is less likely to be misclassified as a new `create` event.

## Directory structure

```text
relationship-capture/
  README.md
  schemas/
    relationship-capture.input.schema.json
    relationship-capture.output.schema.json
  samples/
    relationship-capture.request.ingest.example.json
    relationship-capture.response.ingest.example.json
    relationship-capture.request.commit.example.json
    relationship-capture.response.commit.example.json
  runtime/
    relationship-capture.mjs
    run-relationship-capture.mjs
    capture-smoke.mjs
```

## Run

```powershell
node relationship-capture\runtime\run-relationship-capture.mjs `
  relationship-capture\samples\relationship-capture.request.ingest.example.json `
  relationship-capture\samples\relationship-capture.response.ingest.example.json
```

```powershell
node relationship-capture\runtime\run-relationship-capture.mjs `
  relationship-capture\samples\relationship-capture.request.commit.example.json `
  relationship-capture\samples\relationship-capture.response.commit.example.json
```
