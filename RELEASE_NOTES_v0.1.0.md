# CoStar v0.1.0 — First public release

## Highlights

- Open-core relationship context engine for `capture -> profile -> briefing`.
- Local `costar` CLI with an interactive `costar init` wizard for pluggable OpenAI-compatible models.
- Confirm-first workflow for durable people profiles, markdown views, graph review, and reusable meeting prep.
- OpenClaw adapter path included for users who want to test CoStar inside an existing skill host.
- Bilingual launch docs and sanitized mock examples for safer public evaluation.

## Quick Start

Clone the repository, install dependencies, and run the init wizard:

```powershell
git clone https://github.com/Mechanics130/costar_agent.git
cd costar_agent
npm install
node bin/costar.mjs init
```

After initialization, try a sample run:

```powershell
node bin/costar.mjs capture relationship-capture/samples/relationship-capture.request.example.json
```

## Known Limitations

- Public visual assets are still pending:
  - `assets/demo.gif`
  - `assets/architecture.png`
  - `assets/social-card.png`
- CoStar is still distributed as a CLI-first open-core engine; the hosted consumer UI layer is separate from this repository.

## Thanks

Thanks to the early reviewers and testers who helped harden the public release path, especially around repo hygiene, documentation clarity, and release readiness.
