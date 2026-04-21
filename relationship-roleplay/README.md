# Relationship Roleplay Skill

This directory is the standalone workspace for `relationship-roleplay`.

It consumes confirmed person profiles and relationship information and
generates:

- focused dialogue simulations
- likely responses and pushback detection
- recommended replies and progression strategy
- coach-style feedback

This version only handles single-person roleplay. It does not yet simulate
group meetings or intervene in live conversations.

## Directory structure

```text
relationship-roleplay/
  README.md
  prompts/
    relationship-roleplay.system.prompt.md
  schemas/
    relationship-roleplay.input.schema.json
    relationship-roleplay.output.schema.json
  samples/
    relationship-roleplay.request.example.json
    relationship-roleplay.response.example.json
  runtime/
    relationship-roleplay.mjs
    run-relationship-roleplay.mjs
    roleplay-smoke.mjs
    runs/
```

## Current input

The current version supports two primary input styles:

1. pass `target_profile` directly
2. pass `profile_store_path + person_name/person_ref`

## Current output

The runtime consistently produces structured roleplay results, including:

- `persona_read`
- `opening_assessment`
- `simulated_turns`
- `likely_pushbacks`
- `recommended_replies`
- `danger_zones`
- `coach_feedback`

## Run

```powershell
node relationship-roleplay\runtime\run-relationship-roleplay.mjs `
  relationship-roleplay\samples\relationship-roleplay.request.example.json `
  relationship-roleplay\samples\relationship-roleplay.response.example.json
```

The model config is reused from:

`relationship-ingestion\runtime\model-config.local.json`
