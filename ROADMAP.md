# CoStar Roadmap

This roadmap describes the public distribution branch milestones and the
remaining work needed to turn CoStar into a cleaner open-core product.

## Status

- Wave 1: complete as of 2026-04-21
- Wave 2: complete as of 2026-04-21
- Wave 3: in progress, with most public-facing docs already done

## Wave 1 - Public release hygiene

Target window: 2026-04-21

Completed items:

- Apache-2.0 license
- `package.json`
- root branding and open-core positioning
- public sample sanitization
- bilingual entry docs

## Wave 2 - Trust and usability

Target window: 2026-04-21 to 2026-04-22

Completed items:

- `costar` CLI entrypoint
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CHANGELOG.md`
- GitHub Actions CI
- issue / PR templates
- public sample checks
- OpenClaw bootstrap path

## Wave 3 - Public launch assets

Target window: 2026-04-23 to 2026-05-09

Completed items:

1. Examples pack
   - `examples/` with a few end-to-end user stories
   - README links from each example back to the sample skill

2. Public comparison note
   - CoStar vs Dex / Clay / Notion / ChatGPT direct usage

3. Product shell handoff note
   - clear separation between the open-core engine and the consumer UI layer

4. Public pitch docs
   - English pitch
   - Chinese pitch

5. Interactive bootstrap
   - `costar init`
   - environment-aware local config generation

Remaining items:

- Demo asset pack
  - `assets/demo.gif`
  - `assets/architecture.png`
  - `assets/social-card.png`

## Wave 3 exit criterion

CoStar is ready for a broader public announcement when:

- a new user can understand the repo in under 3 minutes
- `npm test` passes locally on clean checkout
- the quick-start path is down to a simple `costar init` plus sample run
- public samples contain no internal project codenames or local tester paths
