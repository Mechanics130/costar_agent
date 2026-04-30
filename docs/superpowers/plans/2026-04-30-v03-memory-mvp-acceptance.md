# CoStar V0.3 Memory MVP 测试验收方案

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans when running this acceptance plan step-by-step. Record every command, pass/fail result, bug, and evidence path.

**Goal:** Verify CoStar V0.3 Memory MVP works across local CLI, host-model adapters, and the existing V0.2 compatibility surface.

**Architecture:** Tests are split into automated local checks, memory-specific CLI checks, and host acceptance checks for Claude / Codex / OpenClaw / CatPaw. Test data must use mock people and isolated temporary stores only.

**Tech Stack:** Node.js >=18, npm, CoStar CLI, local JSON stores, Claude / Codex / OpenClaw / CatPaw host-model skill surfaces where available.

---

## 文档背景与索引

本文档承接《CoStar V0.3 技术实施计划 by codex》，用于 V0.3 开发完成后的验收测试。它面向 Claude / Codex / OpenClaw / CatPaw 等测试者，目标是验证 Memory MVP 是否真正满足“不产生第二套数据世界、可追溯、可确认、可维护、兼容 V0.2 宿主闭环”的发布门槛。

关联文档：

- CoStar V0.3 正式产品建设方案 by codex：https://www.feishu.cn/docx/RbSfdg3D4oumhTxPHn8cZE8GnKg
- CoStar V0.3 Memory MVP 建设方案 by codex：https://www.feishu.cn/docx/JVkDdlOnxonmekxDYJTcW9MenKf
- CoStar V0.3 技术实施计划 by codex：与本文档配套，面向开发执行。
- 私有仓库：https://github.com/Mechanics130/costar_agent-lenny1
- 公开仓库：https://github.com/Mechanics130/costar_agent

验收原则：

- 所有测试使用 mock 数据，不使用真实人名、真实会议纪要或私有飞书链接。
- 所有测试使用隔离临时目录，不污染开发 store。
- 先跑自动化，再跑宿主验收。
- 任何 P0/P1 问题都必须阻断 V0.3 发布。

---

## 0. Scope

This plan tests V0.3 only after the implementation branch is available.

### In Scope

- Atomic memory store.
- Memory candidates.
- Memory review cards.
- Memory commit.
- Briefing evidence trace.
- Fact retrieval tracking.
- Memory lint.
- V0.2 host-model compatibility.
- Public repo hygiene.

### Out Of Scope

- Full SaaS authentication.
- SQLite migration.
- Cloud sync.
- Multi-user isolation.
- Full Web UI.
- Non-people domain transfer test.

---

## 1. Test Environment

### Required Machine Setup

- Node.js >=18.
- npm available.
- Git available.
- Clean test directory outside development repo.

Recommended directories:

```plaintext
D:/tmp/costar-v03-acceptance/
D:/tmp/costar-v03-acceptance/stores/
D:/tmp/costar-v03-acceptance/reports/
```

### Test Data Rules

- Use only fictional people.
- Do not use Lenny's real meeting notes.
- Do not use private Feishu links.
- Do not use local absolute paths from development examples in public reports.

Mock people:

```plaintext
Riley Chen - Product Lead
Taylor Morgan - Engineering Manager
Jordan Lee - Sales Lead
```

---

## 2. Automated Preflight

- [ ] **Step 1: Clone or copy test repo**

Run in a clean directory:

```bash
git clone https://github.com/Mechanics130/costar_agent.git costar-v03-test
cd costar-v03-test
```

If testing private branch before public release:

```bash
git remote add private https://github.com/Mechanics130/costar_agent-lenny1.git
git fetch private feature/v0.3-memory-mvp
git switch -c feature/v0.3-memory-mvp FETCH_HEAD
```

Expected: repo checks out cleanly.

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: install succeeds without requiring model API keys.

- [ ] **Step 3: Run baseline tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 4: Run host-model tests**

Run:

```bash
npm run test:host-model
```

Expected: PASS.

- [ ] **Step 5: Run memory tests**

Run:

```bash
npm run test:memory
```

Expected: PASS.

- [ ] **Step 6: Run public hygiene**

Run:

```bash
node scripts/check-public-repo.mjs
npm pack --dry-run --json
```

Expected: no private docs, runtime stores, real user data, local absolute paths, or Feishu drafts are included.

---

## 3. Memory Store Acceptance

- [ ] **Step 1: Create isolated store path**

Use:

```plaintext
D:/tmp/costar-v03-acceptance/stores/memory-store.json
```

- [ ] **Step 2: Run memory store smoke**

Run:

```bash
node costar-core/memory/memory-store-smoke.mjs
```

Expected:

```plaintext
memory-store-smoke passed
```

- [ ] **Step 3: Verify schema fields**

Open generated or sample store and confirm top-level arrays:

```plaintext
sources
entities
candidates
facts
interactions
relationships
artifacts
```

Pass condition: all exist and are arrays.

---

## 4. Candidate Review Acceptance

- [ ] **Step 1: Run candidate smoke**

Run:

```bash
node costar-core/memory/memory-candidates-smoke.mjs
```

Expected:

```plaintext
memory-candidates-smoke passed
```

- [ ] **Step 2: Confirm candidate fields**

Inspect candidate output and confirm every candidate has:

```plaintext
candidate_id
candidate_type
suggested_action
confidence
source_id
source_excerpt
review_status
```

Pass condition: no candidate is missing source evidence.

- [ ] **Step 3: Confirm SPECULATIVE guardrail**

Use or create a mock host output that includes:

```json
{
  "compiled_truth": {
    "latent_needs": {
      "counterpart": [{
        "need": "Riley may need political cover before approving launch.",
        "evidence": ["Riley sounded cautious."],
        "confidence": "low"
      }]
    }
  }
}
```

Expected:

- Candidate may be generated.
- Candidate confidence is `speculative`.
- It does not become an active durable fact without explicit user review.

---

## 5. Commit Acceptance

- [ ] **Step 1: Run memory commit smoke**

Run:

```bash
node costar-core/memory/memory-commit-smoke.mjs
```

Expected:

```plaintext
memory-commit-smoke passed
```

- [ ] **Step 2: Verify accepted fact write**

Open the test memory store.

Expected:

- `facts.length` increased.
- accepted fact has `review.reviewed_at`.
- accepted fact has `source_id`.
- accepted fact has `source_excerpt`.

- [ ] **Step 3: Verify speculative deferral**

Expected:

- SPECULATIVE candidate remains in `candidates` or deferred result.
- SPECULATIVE candidate does not appear as `status: active` fact unless the test explicitly edits/accepts it into a non-speculative durable fact.

---

## 6. Briefing Evidence Acceptance

- [ ] **Step 1: Run briefing memory smoke**

Run:

```bash
node costar-core/memory/memory-briefing-smoke.mjs
```

Expected:

```plaintext
memory-briefing-smoke passed
```

- [ ] **Step 2: Generate a briefing with memory store**

Prepare a mock request that includes:

```json
{
  "person_name": "Riley Chen",
  "conversation_goal": "Prepare for launch review",
  "memory_store_path": "D:/tmp/costar-v03-acceptance/stores/memory-store.json",
  "host_reasoning_output": {
    "briefing": {
      "quick_brief": "Lead with rollback confidence.",
      "relationship_read": { "current_state": "cautious", "likely_intent": "risk control", "attitude": "careful", "trust_level": "medium" },
      "approach_strategy": { "goal_translation": "Align on safe launch", "recommended_opening": "Start with risk controls", "recommended_style": "concrete", "why_now": "launch window is near" },
      "talking_points": ["Show rollback plan"],
      "watchouts": ["Do not overpromise"],
      "questions_to_ask": ["What risk would block launch?"],
      "next_actions": ["Send rollback checklist"]
    }
  }
}
```

Run through the host tool or direct workflow command used by the implementation.

Expected response contains:

```plaintext
memory_evidence.facts_included
memory_evidence.evidence_trace_available
```

- [ ] **Step 3: Verify artifact**

Open memory store after briefing.

Expected:

- `artifacts.length` increased.
- newest artifact has `artifact_type: "briefing"`.
- newest artifact has non-empty `facts_included`.
- included fact `quality.retrieval_count` increased.

---

## 7. Memory Lint Acceptance

- [ ] **Step 1: Run lint smoke**

Run:

```bash
node costar-core/memory/memory-lint-smoke.mjs
```

Expected:

```plaintext
memory-lint-smoke passed
```

- [ ] **Step 2: Run CLI lint**

Run:

```bash
node bin/costar.mjs memory lint --store D:/tmp/costar-v03-acceptance/stores/memory-store.json
```

Expected markdown sections:

```plaintext
过期承诺
僵尸 fact
孤立人物
可能矛盾事实
知识缺口
```

- [ ] **Step 3: Confirm lint is read-only**

Record file timestamp before and after lint.

Expected:

- Lint command does not modify facts, entities, or sources.
- If it writes a report file, it writes only to requested report path or artifacts, not hidden data changes.

---

## 8. Host Acceptance Matrix

### Claude

- [ ] Install:

```bash
node bin/costar.mjs host install claude --target-dir D:/tmp/costar-v03-acceptance/Claude --apply-config
```

- [ ] Doctor:

```bash
node D:/tmp/costar-v03-acceptance/Claude/CoStar-Claude/doctor-claude-install.mjs --require-config
```

- [ ] In Claude, ask:

```plaintext
Use CoStar to import this mock meeting note, show memory candidates, ask me to confirm them, commit accepted facts, generate a briefing for Riley Chen, and show the evidence trace.
```

Expected:

- No CoStar model API config required.
- User sees memory candidates.
- User can confirm candidates.
- Briefing includes evidence trace.
- Store is the same CoStar memory store.

### Codex

- [ ] Install:

```bash
node bin/costar.mjs host install codex --target-dir D:/tmp/costar-v03-acceptance/Codex --apply-skill
```

- [ ] Doctor:

```bash
node bin/costar.mjs host doctor codex
```

- [ ] In a clean Codex project, ask:

```plaintext
Use CoStar to run a V0.3 memory loop with mock people only: import, candidate review, commit, briefing evidence, memory lint.
```

Expected:

- No model API config required.
- Codex can use host-model mode.
- Memory store contains facts and artifact refs.

### OpenClaw

- [ ] Install:

```bash
node bin/costar.mjs host install openclaw --target-dir D:/tmp/costar-v03-acceptance/OpenClaw
```

- [ ] Doctor:

```bash
node bin/costar.mjs host doctor openclaw
```

- [ ] In OpenClaw, run equivalent mock loop.

Expected:

- Full chain works in host.
- No second CoStar data world.
- Lint can read same memory store.

### CatPaw

CatPaw is treated as Cursor/Trae-like host compatibility.

- [ ] Use the public host-model prompt packet and tool contract.
- [ ] Run import → review → commit → briefing evidence → lint.

Expected:

- Tool contract is understandable.
- Host can complete loop using its bound model.
- Results are written to same CoStar store.

---

## 9. Regression Acceptance

- [ ] **Step 1: V0.2 flow still works**

Run:

```bash
npm run test:host-model
```

Expected: PASS.

- [ ] **Step 2: Legacy profile still reads**

Run an existing profile sample:

```bash
node relationship-profile/runtime/run-relationship-profile.mjs relationship-profile/samples/relationship-profile.request.get.example.json
```

Expected: command still succeeds.

- [ ] **Step 3: Graph still reads**

Run:

```bash
node relationship-graph/runtime/run-relationship-graph.mjs relationship-graph/samples/relationship-graph.request.get-person-graph.example.json
```

Expected: command still succeeds.

- [ ] **Step 4: View still refreshes**

Run:

```bash
node relationship-view/runtime/run-relationship-view.mjs relationship-view/samples/relationship-view.request.refresh-person.example.json
```

Expected: command still succeeds.

---

## 10. Release Gate

V0.3 can release only if all are true:

- [ ] `npm test` PASS.
- [ ] `npm run test:memory` PASS.
- [ ] `npm run test:host-model` PASS.
- [ ] `node scripts/check-public-repo.mjs` PASS.
- [ ] `npm pack --dry-run --json` contains no runtime stores or private materials.
- [ ] `README.md` includes V0.3 update notes.
- [ ] `README.zh-CN.md` includes V0.3 update notes.
- [ ] `CHANGELOG.md` includes V0.3 update notes.
- [ ] Claude host acceptance PASS or documented as not blocking with explicit reason.
- [ ] Codex host acceptance PASS.
- [ ] OpenClaw host acceptance PASS.
- [ ] CatPaw compatibility PASS.
- [ ] SPECULATIVE durable-write guardrail PASS.
- [ ] Briefing evidence trace coverage for main test cases is at least 80%.
- [ ] Feedback path can record useful/not useful result.

---

## 11. Bug Report Template

Use this format for any V0.3 bug:

```markdown
# CoStar V0.3 Bug Report

## Environment

- Host:
- OS:
- Node version:
- Repo commit:
- Test store path:

## Scenario

What user action was being tested?

## Expected

What should have happened?

## Actual

What happened instead?

## Evidence

- Command:
- Output excerpt:
- Report path:
- Store excerpt:

## Severity

- P0: blocks V0.3 release
- P1: blocks host acceptance or corrupts memory
- P2: workaround exists
- P3: polish
```
