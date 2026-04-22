# Relationship Ingestion Skill

This directory is the standalone workspace for `relationship-ingestion`.
It contains the core assets for the skill itself, not the product shell.

Why this lives separately from the UI prototypes:

- this folder contains the skill implementation, not a page mockup
- the files here are used directly for model calls, structured outputs, and
  real-data debugging
- when we test with real materials, we keep each run's input and output here

## Directory structure

```text
relationship-ingestion/
  README.md
  prompts/
    relationship-ingestion.system.prompt.md
  schemas/
    model-config.schema.json
    relationship-ingestion.input.schema.json
    relationship-ingestion.output.schema.json
    relationship-profile.schema.json
    relationship-review-resolution.input.schema.json
    relationship-review-resolution.output.schema.json
  samples/
    relationship-ingestion.request.example.json
    relationship-ingestion.response.example.json
    relationship-review-resolution.request.example.json
    relationship-review-resolution.response.example.json
  runtime/
    relationship-ingestion.mjs
    relationship-review-resolution.mjs
    run-relationship-review-resolution.mjs
    model-config.local.json
    runs/
    stores/
```

## What this version does

This version runs the first main loop end to end:

`raw material -> normalization -> person detection -> information extraction ->
profile update suggestions -> structured output`

It also begins the second loop:

`review bundle -> user confirmation -> committed profiles -> profile store delta`

This stage primarily serves:

- `capture`
- `profile`
- `briefing`

`roleplay` is not part of the first-stage main loop yet.

## Local file management rules

### `prompts/`

Stores the model system prompts separately from code, so prompt iteration stays
clean and isolated.

### `schemas/`

Stores input, output, and model-config schemas.

No matter whether we are working on the frontend, the backend, or real-data
debugging, everything should follow this schema layer.

### `samples/`

Stores the smallest example requests and responses, so we can compare behavior
quickly after each change.

### `runtime/model-config.local.json`

If you configure your own model API later, the local configuration will be
saved here.

### `runtime/runs/`

Every real execution creates its own run directory, which should at least keep:

- `request.json`
- `response.json`

### `runtime/stores/`

Stores the local `profile store`.
When the review-resolution runtime is used, confirmed records can be upserted
into this store.

## Current runtime entry points

You can run the skill directly from the CLI runner in this folder.

If you want to skip any UI layer and run a request file locally, you can use:

```powershell
node relationship-ingestion\runtime\run-relationship-ingestion.mjs `
  relationship-ingestion\samples\relationship-ingestion.request.example.json
```

The model config template is:

`relationship-ingestion\runtime\model-config.template.json`

The current CLI runner accepts both plain UTF-8 JSON and UTF-8-with-BOM JSON
request files, which helps avoid failures when PowerShell or another tool writes
files with a BOM by default.

If you want to test the "user confirms, then we write back the entity" flow
directly, you can run:

```powershell
node relationship-ingestion\runtime\run-relationship-review-resolution.mjs `
  relationship-ingestion\samples\relationship-review-resolution.request.example.json `
  relationship-ingestion\samples\relationship-review-resolution.response.example.json
```
