# CoStar Core Artifact Layer

This directory holds shared builders for cross-mode artifacts that should stay
stable between Engine mode and Host-model mode.

Current shared artifacts:

- `review-artifacts.mjs`
  - profile review summary
  - profile store delta
  - graph review summary
  - graph review store delta
  - generic commit feedback envelope
- `capture-artifacts.mjs`
  - capture stage response envelope
  - view refresh result artifact

These builders do not contain product-specific inference logic. They only
normalize and shape the artifacts that are written or returned by higher-level
skills.
