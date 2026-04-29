# CoStar Host-model Tool Layer

This directory defines the first shared tool surface for Host-model mode.

Files:

- `tool-contract.mjs`
  - stable tool metadata and capability contract
- `host-model-dispatcher.mjs`
  - minimal dispatcher for deterministic/read tools and the unified commit path

Current rule:

- tools that require host reasoning are defined here, but not executed locally
- tools that are deterministic or commit-based can already be exercised locally

This lets us validate the Host-model surface without creating a second CoStar
data world.
