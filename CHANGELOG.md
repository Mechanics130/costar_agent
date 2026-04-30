# Changelog

All notable changes to CoStar will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/).

## [0.3.0] - Unreleased

### Added

- Atomic memory store for source refs, entities, candidates, facts, interactions, relationships, and artifacts.
- Memory candidate generation from capture results with source excerpts and confidence labels.
- Memory review and commit path for accepted or edited long-term facts.
- Briefing evidence trace with `facts_included`, `memory_evidence`, artifact refs, and fact retrieval tracking.
- `memory_lint` host tool and `costar memory lint` CLI for overdue commitments, zombie facts, isolated entities, possible conflicts, and knowledge gaps.
- Public Memory V0.3 documentation and release-surface checks.

### Changed

- `briefing_generate` can accept `memory_store_path` and write briefing artifact refs into the same atomic memory store.
- `test:memory` now covers store, candidates, review / commit, briefing evidence, and lint.
- Public hygiene checks now guard memory runtime store and private memory file names.

## [0.2.0] - 2026-04-24

### Added

- Briefing insight fields for implicit needs, key issues, consensus / non-consensus, key quotes, and attitude / intent reads.
- Shared `costar-core` modules for deterministic stores, review artifacts, commits, host-model tool contracts, and MCP bridge tests.
- Host-model adapter bundles for Claude, Codex, and OpenClaw so host products can provide model reasoning without requiring a separate CoStar model API key.
- Public support matrix, tester package, host-adapter hygiene note, and generated file map.

### Changed

- `capture`, `profile`, `briefing`, `graph`, and `view` now reuse the same insight normalization and merge rules.
- Public CLI now includes `costar host install`, `costar host doctor`, and `costar host where`.
- Public hygiene checks now ignore git-ignored local artifacts and include the Briefing insight smoke test.

## [0.1.0] - 2026-04-21

### Added

- Open-core CoStar branding and top-level public repository structure.
- `costar` CLI entrypoint for local skill dispatch and initialization.
- OpenClaw adapter bootstrap package under `integrations/openclaw/`.
- Bilingual product documentation (`README.md` and `README.zh-CN.md`).
- Public roadmap and contribution / security guidance.

### Changed

- Public sample data is being sanitized to remove internal project codenames.
- Distribution docs now emphasize the core loop: `capture -> profile -> briefing`.
