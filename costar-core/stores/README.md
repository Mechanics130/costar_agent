# CoStar Core Store Access Layer

This folder centralizes file-backed store access for CoStar Core.

Current stores:

- `profile-store.mjs`
- `graph-review-store.mjs`
- `view-store.mjs`

The goal is not to change store semantics yet. The goal is to ensure:

- one place for BOM-safe JSON loading
- one place for path resolution and directory creation
- one write format for newline-terminated JSON stores
- one migration path when CoStar moves from file stores to a database-backed layer later

These modules are intentionally deterministic and host-agnostic so both:

- Engine mode
- Host-model mode

can share the same store access contract.
