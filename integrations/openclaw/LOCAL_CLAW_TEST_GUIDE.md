# CoStar OpenClaw Local Test Guide

This guide is for testing CoStar Host-model mode with a local OpenClaw / claw runtime on Windows or macOS.

The goal is to verify that OpenClaw can use its own host model to reason and orchestrate, while CoStar owns the durable relationship state.

## Hard Acceptance Questions

The test must answer these four questions:

1. Does the user no longer need to configure a separate CoStar model API?
2. Can the user complete the full loop inside OpenClaw?
3. Do generated results enter the same CoStar store / schema / review system?
4. Has CoStar avoided splitting into two data worlds?

## Test Scope

In scope:

- OpenClaw can discover the `costar` skill.
- OpenClaw uses the installed `SKILL.md`, `PROMPT_PACKET.md`, `SESSION_PROTOCOL.md`, and `TEST_PACK.md`.
- OpenClaw can run the local CoStar host-model smoke checks.
- OpenClaw can complete a local host loop with capture, review cards, translated review answers, commit, view refresh, and briefing / roleplay / graph follow-up.

Out of scope for this round:

- public repo release checks
- Claude / Cursor host tests
- real multi-user SaaS behavior
- replacing OpenClaw's own model provider

## Install CoStar Into Local OpenClaw

From the CoStar repo:

```bash
cd <your-costar-repo>
node bin/costar.mjs host install openclaw --openclaw-skills-dir <openclaw-skills-dir>
```

Typical skills directory examples:

- macOS: `~/.openclaw/skills`
- Windows: `%USERPROFILE%\.openclaw\skills`

Expected result:

```text
<openclaw-skills-dir>/CoStar/
  SKILL.md
  PROMPT_PACKET.md
  SESSION_PROTOCOL.md
  TEST_PACK.md
  TEST_RESULTS_TEMPLATE.md
  MOCK_TRANSCRIPT.md
  tool-exposure.json
  sample-workflow.md
  samples/
```

## Confirm OpenClaw Can Discover The Skill

Run:

```bash
openclaw skills info costar
```

Expected result:

- status is ready
- source is OpenClaw-managed or equivalent
- requirements show `node` as available
- no message asks for a CoStar API key, base URL, or model name

## Run Direct CoStar Host-model Checks

From the CoStar repo:

```bash
cd <your-costar-repo>

node costar-core/host-model-adapter/openclaw-test-pack-smoke.mjs
node costar-core/host-model-adapter/openclaw-bootstrap-smoke.mjs
node costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs
npm run test:host-model
```

Expected result:

- all commands pass
- no command asks for `base_url`, `api_key`, or `model`
- `host-model-e2e-smoke` verifies capture -> review -> commit -> view -> briefing / roleplay

## Run An OpenClaw Host Turn

Use a fresh OpenClaw session after installing the skill.

Example command:

```bash
openclaw agent --agent main --json --timeout 240 --message "Use the costar skill to run a local Host-model closed-loop validation. Do not ask the user to configure a CoStar model API. Check <openclaw-skills-dir>/CoStar/TEST_PACK.md, then run: 1) node <your-costar-repo>/costar-core/host-model-adapter/openclaw-test-pack-smoke.mjs 2) node <your-costar-repo>/costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs. Finish with a short answer saying whether the four hard acceptance questions passed."
```

Expected result:

- OpenClaw recognizes and uses the CoStar skill.
- OpenClaw runs the two checks.
- OpenClaw reports pass / fail for all four hard acceptance questions.

## Optional Real-use Prompt

After the smoke checks pass, test a more realistic conversation:

```text
Use the costar skill to import this meeting note: <path-to-meeting-note.md>

Requirements:
- Do not ask me to configure a CoStar model API.
- Show detected feedback and review cards first.
- Do not write before I confirm.
- After I confirm, commit through CoStar.
- After commit, refresh view and give me a briefing plus graph summary.
```

The host should:

1. use OpenClaw's own model to understand the source
2. call CoStar host-model tools
3. show review cards before commit
4. commit only through CoStar
5. refresh / read durable CoStar views

## What Counts As Pass

Pass if:

- No separate CoStar model API is requested.
- OpenClaw can discover `costar`.
- OpenClaw can run the local host-model checks.
- A host turn can reach capture -> review -> commit -> view.
- Follow-up briefing / graph / roleplay reads from the committed CoStar world.

Fail if:

- OpenClaw asks for a CoStar `api_key`, `base_url`, or `model`.
- OpenClaw invents a commit payload instead of using `review_translate_answers`.
- OpenClaw says it committed but CoStar stores/views do not change.
- OpenClaw keeps its own separate relationship memory instead of using CoStar.

## Result Template

Fill in:

- `TEST_RESULTS_TEMPLATE.md`

At minimum record:

- commands run
- pass/fail for the four hard questions
- exact failure messages if any
- whether the flow felt like one CoStar data world or two

## Current Known Boundary

This local guide validates OpenClaw as a host-model runner on this machine. It is stronger than a pure CoStar smoke test, but still not a broad multi-machine release test.

For release readiness, repeat this guide on a clean Windows machine and a clean macOS machine or fresh OpenClaw profile.
