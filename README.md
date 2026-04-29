# CoStar

<p align="center">
  <img src="assets/branding/costar.png" alt="CoStar logo" width="560" />
</p>

<p align="center"><strong>Durable people context, confirmed by you, reused forever.</strong></p>

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-18%2B-green.svg)](https://nodejs.org/)
[![CI](https://github.com/Mechanics130/costar_agent/actions/workflows/ci.yml/badge.svg)](https://github.com/Mechanics130/costar_agent/actions/workflows/ci.yml)

CoStar is an open-core skill engine for durable relationship context. Think of
it like a chief of staff that never forgets: it turns messy notes, meetings,
transcripts, and history into people profiles, confirmed updates, briefs,
roleplay simulations, graph views, and persistent markdown views.

If you are a developer or product builder, this repository gives you the skill
core. If you are looking for the hosted consumer product, that lives in a
separate UI layer built on top of CoStar.

## What CoStar Does

CoStar is designed around a simple loop:

1. `capture`
   - accept single or batch inputs
   - recall relevant existing context automatically
   - show the user what was found and what needs review

2. `profile`
   - read, search, and patch person profiles
   - support both cold-start and mature profiles

3. `briefing`
   - generate meeting prep from confirmed context
   - surface implicit needs, key issues, consensus / non-consensus, key quotes, and attitude / intent reads
   - keep it short enough to read before a conversation

## Host-Model Mode

CoStar now has host-model adapter bundles for Claude, Codex, and OpenClaw.
In host-model mode, the host product supplies model reasoning and CoStar keeps
the durable stores, schemas, review / commit flow, graph, view, and briefing
contracts. This means users should not need a separate CoStar model API key.

Fast install checks:

```bash
node bin/costar.mjs host install claude
node bin/costar.mjs host doctor claude
node bin/costar.mjs host install codex --apply-skill
node bin/costar.mjs host doctor codex
node bin/costar.mjs host install openclaw
node bin/costar.mjs host doctor openclaw
```

See [support matrix](docs/support-matrix.md) and [tester package](docs/tester-package.md)
for the current acceptance scope.

## Advanced Skills

These skills are already included, but they are not the headline loop:

- `relationship-roleplay`
- `relationship-graph`
- `relationship-view`
- `relationship-ingestion`

## Quick Start

If you are a test user, start here:

- [START_HERE.md](START_HERE.md)

If you want the fastest local setup, run the init wizard:

```powershell
node bin/costar.mjs init
```

The wizard reads `OPENAI_BASE_URL`, `OPENAI_MODEL`, and `OPENAI_API_KEY`
from your environment when they are already set. Otherwise it will guide you
through the local model config step by step.

If you are a Chinese reader, see:

- [README.zh-CN.md](README.zh-CN.md)

If you are using OpenClaw, the fastest path is:

1. Read `integrations/openclaw/README.md`
2. Run `node bin/costar.mjs host install openclaw`
3. Run `node bin/costar.mjs host doctor openclaw`

## Launch Docs

If you want to share CoStar with someone else, start with:

- [English pitch](docs/pitch-en.md)
- [Chinese pitch](docs/pitch-zh.md)
- [Comparison notes](docs/comparison.md)
- [Architecture overview](docs/architecture.md)
- [Examples](examples/README.md)

## Community

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)

## Command Line

Once the repo is cloned, you can use the `costar` CLI:

```powershell
node bin/costar.mjs --help
```

Available commands:

- `costar init`
- `costar capture`
- `costar ingestion`
- `costar profile`
- `costar briefing`
- `costar roleplay`
- `costar graph`
- `costar view`
- `costar doctor`

## Repository Layout

```text
costar_agent/
  assets/branding/            Brand assets for GitHub and docs
  bin/                        CoStar CLI entrypoint
  costar-core/                 Shared stores, commits, host tools, and MCP bridge
  examples/                   Small public example stories
  integrations/claude/        Claude host-model adapter bundle
  integrations/codex/         Codex host-model skill adapter
  integrations/openclaw/      OpenClaw host-model adapter and bootstrap helpers
  relationship-ingestion/     Core extraction and review-resolution engine
  relationship-capture/       User-facing ingestion orchestration layer
  relationship-profile/       Durable profile read/update skill
  relationship-briefing/      Brief generation from confirmed context
  relationship-roleplay/      Structured simulated dialogue skill
  relationship-graph/         Relationship graph and pathfinding skill
  relationship-view/          Persistent markdown views and refresh logic
```

## Safety

Do not commit:

- `relationship-ingestion/runtime/model-config.local.json`
- runtime run outputs
- validation workspaces
- private real-data scenarios

Keep your own private data local unless you explicitly want to share a test case.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the current delivery plan and target dates.
