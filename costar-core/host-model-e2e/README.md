# CoStar Host-model E2E Scaffold

This directory holds the first end-to-end validation scaffold for Host-model
mode.

It exists to answer one question before we integrate any host deeply:

> Can Host-model mode run against the same CoStar stores, schemas, review
> paths, and durable artifacts without creating a second data world?

Contents:

- `host-model-e2e-checklist.md`
  - the human-readable acceptance checklist
- `scenarios/`
  - baseline mock scenarios for cold-start and incremental update flows
- `runtime/host-model-e2e-smoke.mjs`
  - contract-level smoke validation for the current Host-model foundation

Current scope:

- validates tool contract coverage
- validates unique writable commit targets
- validates deterministic dispatcher coverage
- does **not** yet validate a full real-host conversation loop

That real-host loop will be added in the next phase when Claude / Codex adapter
skeleta exist.
