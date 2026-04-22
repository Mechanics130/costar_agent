# CoStar OpenClaw Skill Wrapper

This wrapper exists so OpenClaw users can install CoStar with less manual setup.

It does not reimplement CoStar.
It only provides the adapter layer that points the assistant to the local CoStar repository.

## What the wrapper routes to

- `capture` -> `relationship-capture`
- `profile` -> `relationship-profile`
- `briefing` -> `relationship-briefing`
- `roleplay` -> `relationship-roleplay`
- `graph` -> `relationship-graph`
- `view` -> `relationship-view`

## What the installer does

- writes `relationship-ingestion/runtime/model-config.local.json`
- copies this wrapper into the OpenClaw skills directory
- replaces the repo root placeholder with the actual local path
- optionally runs smoke checks

