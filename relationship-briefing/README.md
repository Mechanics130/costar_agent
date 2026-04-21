# Relationship Briefing Skill

This directory is the standalone workspace for `relationship-briefing`.

It consumes confirmed person profiles and relationship information and
generates:

- pre-meeting briefings
- communication goal breakdowns
- watchouts
- suggested outlines

This version only handles single-person briefings. It does not yet combine
multi-person pre-meeting strategy.

## Directory structure

```text
relationship-briefing/
  README.md
  prompts/
    relationship-briefing.system.prompt.md
  schemas/
    relationship-briefing.input.schema.json
    relationship-briefing.output.schema.json
  samples/
    relationship-briefing.request.example.json
    relationship-briefing.response.example.json
  briefings/
  runtime/
    relationship-briefing.mjs
    run-relationship-briefing.mjs
    briefing-smoke.mjs
    runs/
```

## Current input

The current version supports two primary input styles:

1. pass `target_profile` directly
2. pass `profile_store_path + person_name/person_ref`

It also supports the following enrichment inputs:

- `meeting_context`
- `recent_interactions`
- when omitted, it recalls context automatically from `profile store + relationship-view`

## Current output

The runtime consistently produces structured briefing content, including:

- `quick_brief`
- `relationship_read`
- `approach_strategy`
- `talking_points`
- `watchouts`
- `questions_to_ask`
- `next_actions`

At the same time, the runtime writes a persistent markdown file to:

`relationship-briefing/briefings/`

The return payload also includes:

- `context_receipt`
- `briefing_file`
- `user_feedback`

## Run

```powershell
node relationship-briefing\runtime\run-relationship-briefing.mjs `
  relationship-briefing\samples\relationship-briefing.request.example.json `
  relationship-briefing\samples\relationship-briefing.response.example.json
```

The model config is reused from:

`relationship-ingestion\runtime\model-config.local.json`
