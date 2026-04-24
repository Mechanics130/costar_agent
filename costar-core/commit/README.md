# CoStar Core Commit Layer

This directory defines the write-entry contract that Host-model mode should use.

Current writable targets:

- `profile_review`
  - delegates to `relationship-review-resolution`
- `graph_review`
  - delegates to `relationship-graph-review-resolution`

Design rule:

- Host-model adapters should not invent new write paths.
- All durable writes should continue to flow through the same review/commit logic
  already used by Engine mode.
