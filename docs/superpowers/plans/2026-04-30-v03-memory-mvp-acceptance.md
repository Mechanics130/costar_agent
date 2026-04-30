# CoStar V0.3 Memory MVP 测试验收方案

> **面向测试 Agent：** 按本文档验收时必须使用 `superpowers:executing-plans` 逐步执行。每个命令都要记录执行结果、PASS/FAIL、问题级别和证据路径。完成前必须使用 `superpowers:verification-before-completion`，不能凭感觉宣布通过。

**验收目标：** 验证 CoStar V0.3 Memory MVP 是否能在本地 CLI、host-model adapters、以及既有 V0.2 兼容面上稳定工作。

**验收架构：** 测试分为自动化预检、memory 专项验收、宿主验收和发布门槛检查。测试数据必须使用 mock 人物与隔离临时 store，不允许使用真实人名、真实会议纪要或私有飞书链接。

**依赖环境：** Node.js >=18、npm、Git、CoStar CLI、本地 JSON store，以及可用时的 Claude / Codex / OpenClaw / CatPaw 宿主环境。

---

## 文档背景与索引

本文档承接《CoStar V0.3 技术实施计划 by codex》，用于 V0.3 开发完成后的验收测试。它面向 Claude / Codex / OpenClaw / CatPaw 等测试者，目标是验证 Memory MVP 是否真正满足“不产生第二套数据世界、可追溯、可确认、可维护、兼容 V0.2 宿主闭环”的发布门槛。

关联文档：

- CoStar V0.3 正式产品建设方案 by codex：见团队飞书 V0.3 Memory 文件夹。
- CoStar V0.3 Memory MVP 建设方案 by codex：见团队飞书 V0.3 Memory 文件夹。
- CoStar V0.3 技术实施计划 by codex：与本文档配套，面向开发执行。
- 私有仓库：见团队 GitHub 私有备份仓库配置。
- 公开仓库：https://github.com/Mechanics130/costar_agent

验收原则：

- 所有测试使用 mock 数据，不使用真实人名、真实会议纪要或私有飞书链接。
- 所有测试使用隔离临时目录，不污染开发 store。
- 先跑自动化，再跑宿主验收。
- 任意 P0/P1 问题都必须阻断 V0.3 发布。
- 如果宿主暂不可测，必须写清楚原因、影响范围和补测计划。

---

## 0. 测试范围

本文档只验收 V0.3 Memory MVP，不重新验收完整商业化产品。

### 本轮必须覆盖

- Atomic memory store。
- Memory candidates。
- Memory review cards。
- Memory commit。
- Briefing evidence trace。
- Fact retrieval tracking。
- Memory lint。
- V0.2 host-model 兼容性。
- 公开仓库卫生检查。

### 本轮不覆盖

- SaaS 用户认证。
- SQLite 迁移。
- 云同步。
- 多用户隔离。
- 完整 Web UI。
- 非人脉领域迁移测试。

---

## 1. 测试环境

### 机器准备

必须具备：

- Node.js >=18。
- npm 可用。
- Git 可用。
- 位于开发仓库之外的干净测试目录。

推荐目录：

```plaintext
D:/tmp/costar-v03-acceptance/
D:/tmp/costar-v03-acceptance/stores/
D:/tmp/costar-v03-acceptance/reports/
```

### 测试数据规则

- 只使用虚构人物。
- 不使用 Lenny 的真实会议纪要。
- 不使用私有飞书链接。
- 测试报告中不写入开发机本地绝对路径，除非它是测试临时目录。

Mock 人物：

```plaintext
Riley Chen - Product Lead
Taylor Morgan - Engineering Manager
Jordan Lee - Sales Lead
```

---

## 2. 自动化预检

- [ ] **步骤 1：克隆或复制测试仓库**

在干净目录执行：

```bash
git clone https://github.com/Mechanics130/costar_agent.git costar-v03-test
cd costar-v03-test
```

如果测试的是私有分支：

```bash
git remote add private <private-repo-url>
git fetch private feature/v0.3-memory-mvp
git switch -c feature/v0.3-memory-mvp FETCH_HEAD
```

预期：仓库可以干净 checkout。

- [ ] **步骤 2：安装依赖**

```bash
npm install
```

预期：安装成功，且不要求配置 CoStar 专用模型 API key。

- [ ] **步骤 3：运行基础测试**

```bash
npm test
```

预期：PASS。

- [ ] **步骤 4：运行 host-model 测试**

```bash
npm run test:host-model
```

预期：PASS。

- [ ] **步骤 5：运行 memory 测试**

```bash
npm run test:memory
```

预期：PASS。

- [ ] **步骤 6：运行公开仓库卫生检查**

```bash
node scripts/check-public-repo.mjs
npm pack --dry-run --json
```

预期：不包含私有文档、runtime stores、真实用户数据、本地开发绝对路径或飞书草稿。

---

## 3. Memory Store 验收

- [ ] **步骤 1：创建隔离 store 路径**

使用：

```plaintext
D:/tmp/costar-v03-acceptance/stores/memory-store.json
```

- [ ] **步骤 2：运行 store smoke test**

```bash
node costar-core/memory/memory-store-smoke.mjs
```

预期：

```plaintext
memory-store-smoke passed
```

- [ ] **步骤 3：检查 schema 顶层字段**

打开生成的 store 或 sample，确认存在：

```plaintext
sources
entities
candidates
facts
interactions
relationships
artifacts
```

通过标准：全部存在，且都是数组。

---

## 4. Candidate Review 验收

- [ ] **步骤 1：运行 candidate smoke test**

```bash
node costar-core/memory/memory-candidates-smoke.mjs
```

预期：

```plaintext
memory-candidates-smoke passed
```

- [ ] **步骤 2：检查 candidate 字段**

每个 candidate 必须包含：

```plaintext
candidate_id
candidate_type
suggested_action
confidence
source_id
source_excerpt
review_status
```

通过标准：没有 candidate 缺失证据来源。

- [ ] **步骤 3：验证 SPECULATIVE 护栏**

使用或构造包含低置信度隐形需求的 mock output：

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

预期：

- 可以生成 candidate。
- candidate confidence 是 `speculative`。
- 没有用户显式 review 前，它不能成为 active durable fact。

---

## 5. Commit 验收

- [ ] **步骤 1：运行 memory commit smoke test**

```bash
node costar-core/memory/memory-commit-smoke.mjs
```

预期：

```plaintext
memory-commit-smoke passed
```

- [ ] **步骤 2：检查 accepted fact 写入**

打开测试 memory store。

预期：

- `facts.length` 增加。
- accepted fact 有 `review.reviewed_at`。
- accepted fact 有 `source_id`。
- accepted fact 有 `source_excerpt`。

- [ ] **步骤 3：检查 speculative defer**

预期：

- SPECULATIVE candidate 保留在 `candidates` 或 deferred result。
- 除非测试中明确编辑并确认，否则 SPECULATIVE candidate 不能出现为 `status: active` fact。

---

## 6. Briefing Evidence 验收

- [ ] **步骤 1：运行 briefing memory smoke test**

```bash
node costar-core/memory/memory-briefing-smoke.mjs
```

预期：

```plaintext
memory-briefing-smoke passed
```

- [ ] **步骤 2：生成带 memory store 的 briefing**

准备 mock request：

```json
{
  "person_name": "Riley Chen",
  "conversation_goal": "Prepare for launch review",
  "memory_store_path": "D:/tmp/costar-v03-acceptance/stores/memory-store.json",
  "host_reasoning_output": {
    "briefing": {
      "quick_brief": "Lead with rollback confidence.",
      "relationship_read": {
        "current_state": "cautious",
        "likely_intent": "risk control",
        "attitude": "careful",
        "trust_level": "medium"
      },
      "approach_strategy": {
        "goal_translation": "Align on safe launch",
        "recommended_opening": "Start with risk controls",
        "recommended_style": "concrete",
        "why_now": "launch window is near"
      },
      "talking_points": ["Show rollback plan"],
      "watchouts": ["Do not overpromise"],
      "questions_to_ask": ["What risk would block launch?"],
      "next_actions": ["Send rollback checklist"]
    }
  }
}
```

通过 host tool 或实现中指定的 direct workflow command 执行。

预期 response 包含：

```plaintext
memory_evidence.facts_included
memory_evidence.evidence_trace_available
```

- [ ] **步骤 3：检查 artifact 写回**

打开 briefing 后的 memory store。

预期：

- `artifacts.length` 增加。
- 最新 artifact 的 `artifact_type` 是 `briefing`。
- 最新 artifact 的 `facts_included` 非空。
- 被引用 fact 的 `quality.retrieval_count` 增加。

---

## 7. Memory Lint 验收

- [ ] **步骤 1：运行 lint smoke test**

```bash
node costar-core/memory/memory-lint-smoke.mjs
```

预期：

```plaintext
memory-lint-smoke passed
```

- [ ] **步骤 2：运行 CLI lint**

```bash
node bin/costar.mjs memory lint --store D:/tmp/costar-v03-acceptance/stores/memory-store.json
```

预期 markdown 包含：

```plaintext
过期承诺
僵尸 fact
孤立人物
可能矛盾事实
知识缺口
```

- [ ] **步骤 3：确认 lint 默认只读**

记录 lint 前后的文件时间戳和 store 内容。

通过标准：

- lint 命令不修改 facts、entities、sources。
- 如果写 report 文件，只能写入显式指定的 report path 或 artifacts，不能产生隐藏数据变更。

---

## 8. 宿主验收矩阵

### Claude

- [ ] 安装：

```bash
node bin/costar.mjs host install claude --target-dir D:/tmp/costar-v03-acceptance/Claude --apply-config
```

- [ ] Doctor：

```bash
node D:/tmp/costar-v03-acceptance/Claude/CoStar-Claude/doctor-claude-install.mjs --require-config
```

- [ ] 在 Claude 中输入：

```plaintext
Use CoStar to import this mock meeting note, show memory candidates, ask me to confirm them, commit accepted facts, generate a briefing for Riley Chen, and show the evidence trace.
```

预期：

- 不需要配置 CoStar 专用模型 API。
- 用户能看到 memory candidates。
- 用户能确认 candidates。
- briefing 包含 evidence trace。
- 结果写入同一套 CoStar memory store。

### Codex

- [ ] 安装：

```bash
node bin/costar.mjs host install codex --target-dir D:/tmp/costar-v03-acceptance/Codex --apply-skill
```

- [ ] Doctor：

```bash
node bin/costar.mjs host doctor codex
```

- [ ] 在干净 Codex 项目中输入：

```plaintext
Use CoStar to run a V0.3 memory loop with mock people only: import, candidate review, commit, briefing evidence, memory lint.
```

预期：

- 不需要配置 CoStar 专用模型 API。
- Codex 能使用 host-model mode。
- Memory store 包含 facts 和 artifact refs。

### OpenClaw

- [ ] 安装：

```bash
node bin/costar.mjs host install openclaw --target-dir D:/tmp/costar-v03-acceptance/OpenClaw
```

- [ ] Doctor：

```bash
node bin/costar.mjs host doctor openclaw
```

- [ ] 在 OpenClaw 中运行等价 mock loop。

预期：

- 宿主内完整链路可用。
- 不产生第二套 CoStar 数据世界。
- lint 能读取同一套 memory store。

### CatPaw

CatPaw 按 Cursor / Trae-like host compatibility 处理。

- [ ] 使用公开 host-model prompt packet 和 tool contract。
- [ ] 运行 import → review → commit → briefing evidence → lint。

预期：

- Tool contract 可被宿主理解。
- 宿主可使用自己绑定的模型完成闭环。
- 结果写入同一套 CoStar store。

---

## 9. 回归验收

- [ ] **步骤 1：V0.2 host-model 流程仍可用**

```bash
npm run test:host-model
```

预期：PASS。

- [ ] **步骤 2：legacy profile 仍可读取**

```bash
node relationship-profile/runtime/run-relationship-profile.mjs relationship-profile/samples/relationship-profile.request.get.example.json
```

预期：命令成功。

- [ ] **步骤 3：graph 仍可读取**

```bash
node relationship-graph/runtime/run-relationship-graph.mjs relationship-graph/samples/relationship-graph.request.get-person-graph.example.json
```

预期：命令成功。

- [ ] **步骤 4：view 仍可 refresh**

```bash
node relationship-view/runtime/run-relationship-view.mjs relationship-view/samples/relationship-view.request.refresh-person.example.json
```

预期：命令成功。

---

## 10. 发布门槛

V0.3 只有全部满足以下条件才可以发布：

- [ ] `npm test` PASS。
- [ ] `npm run test:memory` PASS。
- [ ] `npm run test:host-model` PASS。
- [ ] `node scripts/check-public-repo.mjs` PASS。
- [ ] `npm pack --dry-run --json` 不包含 runtime stores 或私有材料。
- [ ] `README.md` 包含 V0.3 update notes。
- [ ] `README.zh-CN.md` 包含 V0.3 update notes。
- [ ] `CHANGELOG.md` 包含 V0.3 update notes。
- [ ] Claude host acceptance PASS，或有明确不阻断原因。
- [ ] Codex host acceptance PASS。
- [ ] OpenClaw host acceptance PASS。
- [ ] CatPaw compatibility PASS。
- [ ] SPECULATIVE durable-write guardrail PASS。
- [ ] briefing evidence trace 在主测试用例中的覆盖率至少 80%。
- [ ] feedback path 能记录 useful / not useful。

---

## 11. Bug 报告模板

任何 V0.3 bug 都使用以下格式：

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
