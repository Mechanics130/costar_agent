# Relationship Profile Skill

This directory is the standalone workspace for `relationship-profile`.

It consumes the confirmed and written-back `profile store` and provides four
core capabilities:

- read a single person profile
- search across profiles
- run profile health checks and maintenance suggestions
- perform controlled manual patch write-back

This version focuses on a stable, auditable `profile service layer`. It can run
without relying on an LLM.

## Directory structure

```text
relationship-profile/
  README.md
  schemas/
    relationship-profile.input.schema.json
    relationship-profile.output.schema.json
  samples/
    relationship-profile.request.get.example.json
    relationship-profile.response.get.example.json
    relationship-profile.request.patch.example.json
    relationship-profile.response.patch.example.json
  runtime/
    relationship-profile.mjs
    run-relationship-profile.mjs
    profile-smoke.mjs
    runs/
```

## Current modes

1. `get_profile`
- read a single person profile
- produce a structured `profile_read`
- return related people and maintenance suggestions

2. `search_profiles`
- search by name, alias, tag, summary, intent, and related fields

3. `maintain_store`
- run health checks across the full `profile store`
- surface stale / low-confidence / open-question queues

4. `apply_profile_patch`
- apply a controlled patch to an existing profile
- write the patched result back into the `profile store`

## Run

```powershell
node relationship-profile\runtime\run-relationship-profile.mjs `
  relationship-profile\samples\relationship-profile.request.get.example.json `
  relationship-profile\samples\relationship-profile.response.get.example.json
```

## Default profile store

By default, this skill reuses:

`relationship-ingestion\runtime\stores\relationship-profile-store.json`

If the request explicitly includes `profile_store_path`, that path takes
priority.
