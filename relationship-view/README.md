# Relationship View Skill

`relationship-view` is the persistent user-facing view layer for the relationship skill system.

It is intentionally different from raw one-off runtime responses:
- `relationship-ingestion` produces extraction results
- `relationship-graph` produces graph data and review bundles
- `relationship-view` materializes those into long-lived person views

This means the user no longer has to inspect isolated JSON responses after every import.
Instead, we maintain:
- a persistent `view store`
- one markdown file per person
- a markdown index for quick browsing

## What it does

Current v0 supports:
- `refresh_person_view`
- `refresh_people_views`
- `get_person_view`

Each person view includes:
- latest person summary
- relationship stage / intent / attitude
- latent needs / key issues / attitude-intent insights
- tags / traits / risks / next actions
- local relationship graph summary
- Mermaid graph
- pending graph edges that still need confirmation
- timeline highlights

## Directory structure

```text
relationship-view/
  README.md
  schemas/
    relationship-view.input.schema.json
    relationship-view.output.schema.json
  samples/
    relationship-view.request.refresh-person.example.json
    relationship-view.response.refresh-person.example.json
  runtime/
    relationship-view.mjs
    run-relationship-view.mjs
    view-smoke.mjs
    stores/
    runs/
  views/
```

## Why this layer exists

This layer solves a product problem:
- users should not have to understand raw machine output
- users should not lose continuity across imports
- graph and summary results should accumulate just like profile entities accumulate

So the design principle is:
- extraction results are transient
- person views are persistent

## Run

```powershell
node relationship-view\runtime\run-relationship-view.mjs `
  relationship-view\samples\relationship-view.request.refresh-person.example.json `
  relationship-view\samples\relationship-view.response.refresh-person.example.json
```

## Smoke

```powershell
node relationship-view\runtime\view-smoke.mjs
```

## Current output shape

Main runtime output:
- `person_view`
- `refreshed_views`
- `view_store_overview`
- `view_store_delta`
- `user_feedback`

Persistent artifacts:
- `runtime/stores/relationship-view-store.json`
- `views/<person_ref>.md`
- `views/INDEX.md`

## Current boundary

This is still a skill-layer artifact system, not a final product UI.

It does not yet provide:
- interactive browsing UI
- inline edit / confirm UI
- automatic refresh after every commit

But it already provides:
- durable person summaries
- durable graph snapshots
- readable markdown output for real users
