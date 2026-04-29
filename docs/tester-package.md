# CoStar Tester Package

Use this package when asking someone to validate CoStar from a clean checkout.
It keeps the test scope narrow and avoids mixing private development artifacts
with public release files.

## Test Scope

Testers should validate:

- Host-model install and doctor for the host they use.
- The first user loop: import material, receive feedback, confirm candidates, commit updates, refresh view, and read briefing / graph.
- The enhanced Briefing output: implicit needs, key issues, consensus / non-consensus, key quotes, and attitude / intent.
- Public hygiene: no private local paths, internal API URLs, or real personal data in examples.

Testers should not validate:

- Private development history.
- Real user data from the maintainer.
- Old web prototype files.
- Production SaaS UI behavior.

## Commands

Run repository checks:

```bash
npm test
npm run test:host-model
npm run docs:file-map
```

Claude:

```bash
node bin/costar.mjs host install claude
node bin/costar.mjs host doctor claude
```

Codex:

```bash
node bin/costar.mjs host install codex --apply-skill
node bin/costar.mjs host doctor codex
```

For a full same-machine Codex acceptance run, use:

- [Codex acceptance test manual](codex-acceptance-test-manual.md)

OpenClaw:

```bash
node bin/costar.mjs host install openclaw
node bin/costar.mjs host doctor openclaw
```

Briefing insight smoke:

```bash
npm run test:briefing-insights
```

## Acceptance Questions

- Did the user avoid configuring a separate CoStar model API in host-model mode?
- Could the user complete the full loop inside the host?
- Did generated results enter the same store / schema / review / commit system?
- Did CoStar avoid splitting into two data worlds?
- Was the enhanced Briefing useful and evidence-grounded?

## Bug Report Minimum

Every bug report should include:

- OS and host product.
- CoStar branch and commit.
- Command or prompt used.
- Expected behavior.
- Actual behavior.
- Whether the issue blocks install, full-loop validation, or only polish.
