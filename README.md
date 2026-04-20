# CoStar Agent Skills

Core skill system for `CoStar`.

This repository is intentionally split by branch:

- `main`
  - clean skill distribution only
  - core runtimes
  - prompts
  - schemas
  - sample inputs/outputs
  - minimal repo metadata

- development branch
  - process documentation
  - acceptance and smoke test scripts
  - build notes
  - validation utilities

Sensitive local artifacts are intentionally excluded from version control:

- local model credentials
- runtime stores
- runtime run logs
- validation run workspaces
- generated views and briefings
- real-data scenario outputs

## Included skills on `main`

- `relationship-ingestion`
- `relationship-capture`
- `relationship-profile`
- `relationship-briefing`
- `relationship-roleplay`
- `relationship-graph`
- `relationship-view`

## Repository policy

This repo is code-first and skill-first.

`main` should stay clean and reusable.
Development history, testing helpers, and process materials should live on the development branch unless they are promoted intentionally.
