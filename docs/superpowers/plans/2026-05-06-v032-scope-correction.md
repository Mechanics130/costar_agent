# CoStar V0.3.2 Scope Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reposition V0.3.2 as a feedback-recording and quality-measurement patch, with reflection / hints retained as dormant experimental capabilities.

**Architecture:** Keep the V0.3.1 store and dispatcher surface intact for backward compatibility. Narrow the default host prompt and public docs so stable workflows use feedback records and reports, while reflection / hint tools are clearly experimental and disabled by default.

**Tech Stack:** Node.js ESM, deterministic smoke tests, Markdown docs, Lark onepage updates through `lark-cli docs +update`.

---

## File Map

- Modify `costar-core/host-model-adapter/render-host-prompt-packet.mjs` to narrow canonical workflow 4.
- Modify `costar-core/tools/tool-contract.mjs` to mark reflection / hint tools experimental and disabled by default.
- Modify `costar-core/host-model-adapter/host-adapter-smoke.mjs` to assert narrowed default prompt behavior.
- Modify `costar-core/memory/memory-feedback-smoke.mjs` only if needed to assert experimental paths still work.
- Modify `README.md`, `README.zh-CN.md`, `CHANGELOG.md`, and `docs/memory-v0.3.md` for V0.3.2 language.
- Modify `docs/generated-file-map.md` via `npm run docs:file-map` after file changes.
- Update Feishu onepage Sections 5 and 7, not the document tail.

## Task 1: Narrow Default Host Prompt

- [ ] Replace canonical workflow 4 in `costar-core/host-model-adapter/render-host-prompt-packet.mjs`.

Expected workflow text:

```js
"## Canonical workflow 4: record feedback and measure quality",
"",
"1. When the user says a fact, briefing, graph, or view is useful, wrong, stale, missing, or should be merged, translate that natural-language feedback into structured JSON.",
"2. Call `memory_feedback_record`; do not directly overwrite durable facts from feedback text.",
"3. Use `memory_feedback_report` to inspect whether repeated corrections point to over-inference, stale facts, missing fields, or low-value briefing sections.",
"4. Do not call reflection or hint tools in the default user workflow. Reflection candidates and extraction hints are experimental and disabled by default until enough review-diff evidence exists."
```

- [ ] Run `node costar-core/host-model-adapter/render-host-prompt-packet.mjs --host claude` and verify the output contains `memory_feedback_report`.
- [ ] Verify the output does not contain `memory_reflection_prepare_cards`, `memory_reflection_commit`, or `memory_hints_get` in canonical workflow 4.

## Task 2: Mark Reflection / Hint Tools Experimental

- [ ] Add these fields to `memory_reflection_prepare_cards`, `memory_reflection_commit`, and `memory_hints_get` in `costar-core/tools/tool-contract.mjs`:

```js
    stability: "experimental",
    default_enabled: false,
```

- [ ] Change their `purpose` text to begin with `Experimental, disabled by default:`.
- [ ] Keep `memory_feedback_record` and `memory_feedback_report` without experimental flags.

## Task 3: Update Host Adapter Smoke Tests

- [ ] In `costar-core/host-model-adapter/host-adapter-smoke.mjs`, keep assertions that default packets mention:

```js
memory_feedback_record
memory_feedback_report
```

- [ ] Replace assertions requiring reflection / hint tools in the default packet with assertions that the packet explains they are experimental or disabled by default.
- [ ] Add assertions that the canonical workflow no longer says `call memory_reflection_prepare_cards`, `call memory_reflection_commit`, or `call memory_hints_get`.
- [ ] Run `node costar-core/host-model-adapter/host-adapter-smoke.mjs`.

## Task 4: Preserve Experimental Feedback Smoke Coverage

- [ ] Run `node costar-core/memory/memory-feedback-smoke.mjs`.
- [ ] If it fails because of contract changes, update only expectations that refer to public/default exposure. Do not remove the experimental reflection / hint flow from this smoke test.
- [ ] Confirm the smoke still proves feedback events, reflection candidates, committed hints, and reports can work internally.

## Task 5: Update Public Docs

- [ ] Add a `0.3.2` entry to `CHANGELOG.md` describing:

```markdown
## [0.3.2] - 2026-05-06

### Changed

- Repositioned V0.3.1 learning features as feedback recording and quality reporting by default.
- Marked reflection and extraction-hint tooling as experimental / disabled by default.
- Narrowed host prompt packets so hosts record feedback and inspect reports without automatically injecting hints.
```

- [ ] Update `README.md` and `README.zh-CN.md` so V0.3.2 says feedback reports are stable, while reflection / hints are experimental.
- [ ] Update `docs/memory-v0.3.md` Feedback Loop section with the same stable vs experimental distinction.
- [ ] Run `npm run docs:file-map`.

## Task 6: Update Onepage Sections 5 and 7

- [ ] Use `lark-cli docs +fetch` to locate Section 5 and Section 7 text.
- [ ] Use `lark-cli docs +update --mode replace_range --selection-by-title` or small `replace_all` updates to change Section 5 version route:

```markdown
v0.3.1 = feedback infrastructure shipped
v0.3.2 = scope correction: feedback report stable, reflection / hint dormant experimental
```

- [ ] Update Section 7 release snapshot to show V0.3.2 as current development branch and explain why it is a scope correction.
- [ ] Do not append a new block to the end of the onepage.

## Task 7: Full Verification

- [ ] Run `npm test`.
- [ ] Run `npm run test:memory`.
- [ ] Run `npm run test:host-model`.
- [ ] Run `npm pack --dry-run --json`.
- [ ] Run `git diff --check`.
- [ ] Run docs mojibake sentinel check:

```powershell
node -e "const fs=require('fs'); const files=['README.zh-CN.md','CHANGELOG.md','README.md','docs/memory-v0.3.md']; const sentinels=['鎶',String.fromCharCode(0xfffd),'????']; let bad=[]; for(const f of files){const s=fs.readFileSync(f,'utf8'); for(const n of sentinels) if(s.includes(n)) bad.push(f+':'+n);} if(bad.length){console.error('found mojibake sentinels', bad.join(',')); process.exit(1);} console.log('mojibake sentinel check passed');"
```

## Task 8: Commit and PR

- [ ] Commit with:

```bash
git add .
git commit -m "fix: narrow v0.3.2 memory feedback scope"
```

- [ ] Push to private:

```bash
git push -u private feature/v0.3.2-scope-correction
```

- [ ] Create PR to private `develop`:

```powershell
$repo = (git remote get-url private) -replace '^https://github.com/','' -replace '\.git$',''
gh pr create --repo $repo --base develop --head feature/v0.3.2-scope-correction --title "fix: narrow v0.3.2 memory feedback scope" --body "<summary and test plan>"
```

- [ ] Watch CI with:

```powershell
$repo = (git remote get-url private) -replace '^https://github.com/','' -replace '\.git$',''
gh pr checks <PR_NUMBER> --repo $repo --watch --interval 10
```
