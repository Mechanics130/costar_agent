# Host Adapter Public Hygiene

This document defines the hygiene rules for shipping Claude, Codex, and
OpenClaw adapter files in the public repository.

## What Can Be Public

- Host adapter README, quickstart, test pack, and result template.
- Prompt packet and session protocol.
- Tool exposure manifests.
- Mock transcripts with fictional people and companies only.
- Cross-platform Node installer logic.
- Smoke tests that use temporary directories and mock data.

## What Must Stay Private

- Real user materials.
- Local absolute paths from development machines.
- Private Feishu links or document tokens.
- Internal API endpoints, real model keys, and private provider names.
- Process retrospectives that mention private test users or private workspaces.

## Host-Model Contract

The public adapter must preserve four rules:

- The host supplies reasoning; CoStar owns durable truth.
- Host-model mode does not ask the user for a separate CoStar model API.
- Review and commit always flow through CoStar's canonical store / schema / review system.
- Claude, Codex, and OpenClaw must not create separate CoStar data worlds.

## Pre-Release Checklist

- `npm test` passes.
- `npm run test:host-model` passes.
- `npm run docs:file-map` regenerates the public file map.
- `scripts/check-public-repo.mjs` reports no banned private patterns.
- `docs/support-matrix.md` reflects the real support level.
- `docs/tester-package.md` matches the current test commands.
