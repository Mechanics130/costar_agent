# CoStar V0.3 Memory MVP 技术实施计划

> **面向 Agent 执行者：** 实施本文档时必须使用 Superpowers 工作流。推荐使用 `superpowers:subagent-driven-development` 拆分并行任务；如果单线程执行，则使用 `superpowers:executing-plans`。所有任务使用勾选框跟踪，完成前必须用 `superpowers:verification-before-completion` 做新鲜验证。

**目标：** 在不破坏 V0.2 Host-model 闭环的前提下，为 CoStar 建立可信、可追溯、可审查的 atomic memory 基础层。

**架构方向：** 新增聚焦的 `costar-core/memory/` 模块作为长期事实源；capture、review、commit、briefing、graph、view、host-model 工具都围绕它做适配。现有 profile/view/graph store 保持兼容视图定位，不能演化成第二套独立数据世界。

**技术栈：** Node.js ESM、JSON Schema draft 2020-12、本地 JSON store、既有 CoStar host-model dispatcher、既有 review/commit 协议、npm 测试套件。

---

## 文档背景与索引

本文档承接《CoStar V0.3 正式产品建设方案 by codex》，把产品目标拆成工程可执行任务。它不是产品 PRD，也不是测试报告，而是后续开发者按 Superpowers 流程执行 V0.3 Memory MVP 的实施计划。

关联文档：

- CoStar V0.3 正式产品建设方案 by codex：https://www.feishu.cn/docx/RbSfdg3D4oumhTxPHn8cZE8GnKg
- CoStar V0.3 Memory MVP 建设方案 by codex：https://www.feishu.cn/docx/JVkDdlOnxonmekxDYJTcW9MenKf
- CoStar V0.3 测试验收方案 by codex：与本文档配套，面向 Claude / Codex / OpenClaw / CatPaw 测试者。
- 私有仓库：https://github.com/Mechanics130/costar_agent-lenny1
- 公开仓库：https://github.com/Mechanics130/costar_agent

执行原则：

- 先写测试，再写实现。
- 每个任务小步提交。
- 所有写入仍走 review / commit。
- Atomic memory 是长期事实源，profile/view/graph 是兼容与派生视图。
- V0.3 不破坏 V0.2 host-model 主链路。
- 公开仓库只在版本发布时同步，开发与测试过程材料只进入私有仓库。

---

## 0. 分支与发布纪律

所有实现先在私有仓库完成。

- 私有仓库：`https://github.com/Mechanics130/costar_agent-lenny1`
- 公开仓库：`https://github.com/Mechanics130/costar_agent`
- 基线分支：`develop`
- 功能分支：`feature/v0.3-memory-mvp`
- 发布分支：`release/v0.3.0`

开始实现前：

- [ ] **步骤 1：同步 `develop`**

```bash
git switch develop
git pull --ff-only private develop
```

预期：工作区干净，或只发生 fast-forward。

- [ ] **步骤 2：创建功能分支**

```bash
git switch -c feature/v0.3-memory-mvp
```

预期：新分支从 `develop` 拉出。

- [ ] **步骤 3：明确公开发布边界**

V0.3 未达到发布门槛前，不更新公开仓库。发布时必须同步更新：

```plaintext
README.md
README.zh-CN.md
CHANGELOG.md
docs/support-matrix.md
docs/tester-package.md
```

---

## 1. 文件结构规划

新增 memory 模块，现有模块只作为适配层或派生视图。

### 新增文件

- `costar-core/memory/memory-store.mjs`：读取、规范化、校验、写入 atomic memory store。
- `costar-core/memory/memory-ids.mjs`：生成 source、entity、fact、interaction、relationship、artifact 的稳定 ID。
- `costar-core/memory/memory-candidates.mjs`：把 host extraction output 转成 memory candidates。
- `costar-core/memory/memory-review.mjs`：构建 memory review cards，并把用户确认结果转成 commit decisions。
- `costar-core/memory/memory-commit.mjs`：把 accepted memory candidates 写入 atomic memory store。
- `costar-core/memory/memory-retrieval.mjs`：为 briefing 搜索、排序、记录被使用的 facts。
- `costar-core/memory/memory-lint.mjs`：生成 memory 健康检查报告。
- `costar-core/memory/*-smoke.mjs`：为 store、candidate、commit、briefing、lint 提供 smoke tests。
- `costar-core/memory/schemas/memory-store.schema.json`：atomic memory store schema。
- `costar-core/memory/samples/*.example.*`：空 store、候选提取、lint 报告示例。

### 修改文件

- `costar-core/tools/tool-contract.mjs`：新增 memory tool contracts。
- `costar-core/tools/host-model-dispatcher.mjs`：把 memory tools 路由到 `costar-core/memory/*`。
- `costar-core/commit/costar-commit.mjs`：新增 `memory_review` commit target。
- `costar-core/commit/commit-log-store.mjs`：保证 memory commit log 可解析。
- `costar-core/host-model-workflows/capture-workflow.mjs`：capture 输出增加 `memory_candidates` 与 `source_refs`。
- `costar-core/host-model-workflows/briefing-workflow.mjs`：有 memory store 时检索 facts，并写入 evidence trace。
- `relationship-briefing/runtime/relationship-briefing.mjs`：engine mode 也保留 `facts_included` 与 artifact metadata。
- `bin/costar.mjs`：新增 `costar memory lint`、`costar memory get`、`costar memory search`。
- `package.json`：新增 `test:memory` 或将 memory smoke tests 接入 `test:host-model`。

---

## 2. 任务 1：Atomic Memory Store

目标：建立 V0.3 的长期事实源，支持空 store 创建、读写、规范化、计数和 schema 约束。

涉及文件：

- 新增：`costar-core/memory/schemas/memory-store.schema.json`
- 新增：`costar-core/memory/samples/memory-store.empty.example.json`
- 新增：`costar-core/memory/memory-store.mjs`
- 新增：`costar-core/memory/memory-ids.mjs`
- 新增：`costar-core/memory/memory-store-smoke.mjs`
- 修改：`package.json`

实施步骤：

- [ ] **步骤 1：先写 schema**

`memory-store.schema.json` 顶层必须包含：

```plaintext
version
updated_at
sources
entities
candidates
facts
interactions
relationships
artifacts
```

核心约束：

- `sources` 记录资料来源、标题、导入时间、隐私级别、保留策略。
- `entities` 记录人、组织、项目、主题等实体。
- `candidates` 记录待确认候选事实，必须有 `source_id` 与 `source_excerpt`。
- `facts` 记录已确认长期事实，必须有 `confidence`、`review`、`quality`。
- `interactions` 记录一次互动或会议的摘要、议题、态度、需求。
- `relationships` 记录实体之间关系，必须包含证据来源。
- `artifacts` 记录 briefing/view/graph/lint 等产物，以及它们使用过的 facts。

- [ ] **步骤 2：写空 store 示例**

`memory-store.empty.example.json`：

```json
{
  "version": "0.3.0",
  "updated_at": "",
  "sources": [],
  "entities": [],
  "candidates": [],
  "facts": [],
  "interactions": [],
  "relationships": [],
  "artifacts": []
}
```

- [ ] **步骤 3：先写失败的 smoke test**

`memory-store-smoke.mjs` 需要验证：

- `createEmptyMemoryStore("0.3.0")` 返回完整顶层结构。
- store 文件不存在时，`loadMemoryStore` 返回空 store。
- `writeMemoryStore` 写入后可再次读取。
- 返回结果包含 `store_path`、`written: true`、record counts。

先运行：

```bash
node costar-core/memory/memory-store-smoke.mjs
```

预期：因为 `memory-store.mjs` 尚不存在而失败。

- [ ] **步骤 4：实现稳定 ID 工具**

`memory-ids.mjs` 至少提供：

```javascript
export function stableMemoryId(prefix, parts) {}
export function normalizeIdPart(value) {}
```

要求：

- 相同输入生成相同 ID。
- 支持中英文字符。
- 去除空白和特殊字符。
- 输出长度可控，避免文件名或 JSON 字段过长。

- [ ] **步骤 5：实现 memory store**

`memory-store.mjs` 至少提供：

```javascript
export const MEMORY_STORE_VERSION = "0.3.0";
export function createEmptyMemoryStore(version = MEMORY_STORE_VERSION) {}
export function loadMemoryStore({ storePath, defaultStorePath = "" }) {}
export function writeMemoryStore({ storePath, defaultStorePath = "", store, processedAt = "" }) {}
export function normalizeMemoryStore(value, storePath = "") {}
export function countMemoryRecords(store) {}
```

要求：

- 复用 `costar-core/stores/json-store-utils.mjs`。
- 不在读取时制造副作用。
- 写入时自动补齐 `updated_at`。
- 只接受对象数组，不把字符串或异常值写入核心数组。

- [ ] **步骤 6：验证并接入 npm script**

```bash
node costar-core/memory/memory-store-smoke.mjs
npm run test:memory
```

预期：`memory-store-smoke passed`。

- [ ] **步骤 7：提交**

```bash
git add costar-core/memory package.json
git commit -m "feat: add atomic memory store foundation"
```

---

## 3. 任务 2：Memory Candidates 与 SPECULATIVE 护栏

目标：把资料提取结果先变成“可审查候选项”，而不是直接写成长期事实；低置信度或推测性内容必须进入 review，而不能静默 durable write。

涉及文件：

- 新增：`costar-core/memory/memory-candidates.mjs`
- 新增：`costar-core/memory/memory-candidates-smoke.mjs`
- 新增：`costar-core/memory/samples/memory-candidates.request.example.json`
- 修改：`costar-core/host-model-workflows/capture-workflow.mjs`
- 修改：`package.json`

实施步骤：

- [ ] **步骤 1：写 candidate smoke test**

测试输入使用 mock 人名，例如 `Riley Chen`，不得使用真实用户材料。

测试必须覆盖：

- `source_refs.length > 0`
- 至少生成一个 `entity` candidate。
- 至少生成一个 `fact` candidate。
- 每个 candidate 都有 `source_id` 和 `source_excerpt`。
- 低置信度 latent need / intent 进入 `confidence: "speculative"`。

- [ ] **步骤 2：先运行失败测试**

```bash
node costar-core/memory/memory-candidates-smoke.mjs
```

预期：因为实现文件不存在而失败。

- [ ] **步骤 3：实现 candidate builder**

`memory-candidates.mjs` 至少提供：

```javascript
export function buildMemoryCandidatesFromIngestion(payload) {}
export function normalizeCandidateConfidence(value) {}
export function createSourceRefs(payload) {}
```

候选类型建议：

- `entity`：新人物、新组织、新项目、新主题。
- `fact`：偏好、担忧、约束、承诺、历史、需求、态度意图。
- `interaction`：一次会议或沟通。
- `relationship`：人物之间、人物与项目之间的关系。

护栏：

- `confirmed` 可以进入 durable fact，但仍需 review。
- `inferred` 必须展示证据与置信度。
- `speculative` 默认只能成为 candidate，不能直接成为 active fact。

- [ ] **步骤 4：接入 capture workflow**

`capture-workflow.mjs` 在 host-model extraction 后增加：

```javascript
response.memory_candidates = candidates;
response.source_refs = sourceRefs;
```

要求：

- 不删除 V0.2 已有字段。
- 用户仍能看到导入反馈。
- profile/view/graph 的现有流程不被打断。

- [ ] **步骤 5：验证并提交**

```bash
npm run test:memory
npm run test:host-model
git add costar-core/memory costar-core/host-model-workflows/capture-workflow.mjs package.json
git commit -m "feat: build memory candidates from capture"
```

---

## 4. 任务 3：Memory Review 与 Commit

目标：把候选项展示给用户确认，再把 accepted / edited 的内容写入 atomic memory store，并记录 commit log。

涉及文件：

- 新增：`costar-core/memory/memory-review.mjs`
- 新增：`costar-core/memory/memory-commit.mjs`
- 新增：`costar-core/memory/memory-commit-smoke.mjs`
- 修改：`costar-core/commit/costar-commit.mjs`
- 修改：`costar-core/tools/tool-contract.mjs`
- 修改：`costar-core/tools/host-model-dispatcher.mjs`
- 修改：`package.json`

实施步骤：

- [ ] **步骤 1：写 review/commit smoke test**

测试必须覆盖：

- `buildMemoryReviewCards` 能把 candidates 转为可展示卡片。
- `translateMemoryReviewAnswers` 能把用户确认结果转为 `review_decisions`。
- `commitMemoryReviewDecisions` 能写入 accepted facts。
- rejected / deferred candidates 不会变成 active durable facts。
- SPECULATIVE candidate 不经显式确认不能写入 durable facts。

- [ ] **步骤 2：实现 review card**

Review card 必须包含：

```plaintext
candidate_id
candidate_type
suggested_action
target_entity_hint
proposed_value
confidence
source_excerpt
default_decision
```

展示原则：

- 让用户知道 CoStar 准备记住什么。
- 让用户看到证据来自哪里。
- 让用户能接受、修改、拒绝、暂缓。

- [ ] **步骤 3：实现 commit path**

`memory-commit.mjs` 至少提供：

```javascript
export function commitMemoryReviewDecisions(payload) {}
```

写入要求：

- accepted fact 必须有 `fact_id`、`entity_id`、`source_id`、`source_excerpt`。
- accepted fact 必须有 `review.reviewed_at`。
- 写入后返回 `memory_store_delta`。
- 同步写入或兼容既有 commit log。
- 不破坏 profile/view/graph store 的读取。

- [ ] **步骤 4：接入统一 commit 与工具协议**

`costar-commit.mjs` 增加：

```plaintext
memory_review
```

`tool-contract.mjs` 增加：

```plaintext
memory_review_prepare_cards
memory_review_translate_answers
memory_commit_decisions
```

`host-model-dispatcher.mjs` 需要把这些工具路由到 memory 模块。

- [ ] **步骤 5：验证并提交**

```bash
npm run test:memory
npm run test:host-model
git add costar-core/memory costar-core/commit costar-core/tools package.json
git commit -m "feat: add memory review commit path"
```

---

## 5. 任务 4：Briefing Evidence Trace 与 ArtifactRef

目标：briefing 不只是生成文本，还要记录它引用了哪些长期事实，并把这次 briefing 自身作为 artifact 写回 memory store。

涉及文件：

- 新增：`costar-core/memory/memory-retrieval.mjs`
- 新增：`costar-core/memory/memory-briefing-smoke.mjs`
- 修改：`costar-core/host-model-workflows/briefing-workflow.mjs`
- 修改：`relationship-briefing/runtime/relationship-briefing.mjs`
- 修改：`package.json`

实施步骤：

- [ ] **步骤 1：写 briefing smoke test**

测试必须覆盖：

- store 中已有 `Riley Chen` 的 fact。
- `searchFactsForBriefing` 能返回 `facts_included`。
- `recordBriefingArtifact` 能写入 `artifact_type: "briefing"`。
- 被引用 fact 的 `quality.retrieval_count` 增加。

- [ ] **步骤 2：实现 memory retrieval**

`memory-retrieval.mjs` 至少提供：

```javascript
export function searchFactsForBriefing({ storePath, personName, conversationGoal = "", limit = 8 }) {}
export function recordBriefingArtifact({ storePath, targetEntities = [], factsIncluded = [], artifactPath = "" }) {}
```

排序原则：

- confirmed > inferred > speculative。
- 与 conversation goal 更相关的 fact 优先。
- 已被反复使用且用户标记有效的 fact 可适度加权。
- 被用户标记 wrong 的 fact 降权或排除。

- [ ] **步骤 3：接入 briefing workflow**

`briefing-workflow.mjs` 在请求带 `memory_store_path` 时：

- 检索 memory facts。
- 将结果加入 response 的 `memory_evidence`。
- briefing 写出后记录 artifact。

响应形态：

```javascript
response.memory_evidence = {
  target_entity: memoryHits.target_entity,
  facts_included: memoryHits.facts_included,
  evidence_trace_available: memoryHits.facts_included.length > 0
};
```

- [ ] **步骤 4：保持 engine mode 兼容**

`relationship-briefing/runtime/relationship-briefing.mjs` 的 normalization 不能吞掉：

```plaintext
facts_included
memory_evidence
```

- [ ] **步骤 5：验证并提交**

```bash
npm run test:memory
npm run test:host-model
git add costar-core/memory costar-core/host-model-workflows/briefing-workflow.mjs relationship-briefing/runtime/relationship-briefing.mjs package.json
git commit -m "feat: add briefing memory evidence trace"
```

---

## 6. 任务 5：Memory Lint 与 CLI

目标：让用户和开发者能快速发现 memory 里的过期承诺、僵尸事实、孤立人物、潜在矛盾和知识缺口。

涉及文件：

- 新增：`costar-core/memory/memory-lint.mjs`
- 新增：`costar-core/memory/memory-lint-smoke.mjs`
- 新增：`costar-core/memory/samples/memory-lint.response.example.md`
- 修改：`bin/costar.mjs`
- 修改：`costar-core/tools/tool-contract.mjs`
- 修改：`costar-core/tools/host-model-dispatcher.mjs`
- 修改：`package.json`

实施步骤：

- [ ] **步骤 1：写 lint smoke test**

测试必须构造：

- 一个过期 commitment。
- 一个长时间未被 briefing 使用的 zombie fact。
- 一个没有关联 facts 的 isolated entity。
- 一个 facts 数量过少的 knowledge gap。

预期输出包含：

```plaintext
过期承诺
僵尸 fact
孤立人物
可能矛盾事实
知识缺口
```

- [ ] **步骤 2：实现 lint**

`memory-lint.mjs` 至少提供：

```javascript
export function runMemoryLint({ storePath, now = new Date().toISOString(), zombieDays = 90 } = {}) {}
```

输出要求：

- `status`
- `issue_counts`
- `markdown_report`

- [ ] **步骤 3：新增 CLI**

`bin/costar.mjs` 支持：

```bash
node bin/costar.mjs memory lint --store path/to/memory-store.json
```

要求：

- 默认只读。
- stdout 输出 markdown report。
- 如果未来支持写 report 文件，必须显式传 `--output`。

- [ ] **步骤 4：新增 host-model 工具**

工具协议增加：

```plaintext
memory_lint
```

要求 host 可以在不配置模型 API 的情况下调用 deterministic lint。

- [ ] **步骤 5：验证并提交**

```bash
npm run test:memory
npm test
npm run test:host-model
git add costar-core/memory bin/costar.mjs costar-core/tools package.json
git commit -m "feat: add memory lint and CLI"
```

---

## 7. 任务 6：文档、迁移说明与发布准备

目标：把 V0.3 对用户可见的能力、迁移边界、公开仓库内容和测试包整理清楚。

涉及文件：

- 新增：`docs/memory-v0.3.md`
- 修改：`README.md`
- 修改：`README.zh-CN.md`
- 修改：`CHANGELOG.md`
- 修改：`docs/support-matrix.md`
- 修改：`docs/tester-package.md`
- 修改：`scripts/check-public-repo.mjs`

实施步骤：

- [ ] **步骤 1：新增 memory 说明文档**

`docs/memory-v0.3.md` 至少说明：

- Atomic memory 的定位。
- 与 profile/view/graph 的关系。
- 用户能看到并确认候选事实。
- 每条长期事实必须可追溯来源。
- briefing 能记录使用过哪些 facts。
- memory lint 能发现哪些问题。

- [ ] **步骤 2：更新 README 与 CHANGELOG**

必须更新：

```plaintext
README.md
README.zh-CN.md
CHANGELOG.md
```

README 中增加 V0.3 能力概览和 Quick Start。CHANGELOG 增加：

```markdown
## 0.3.0 - Unreleased

- Added atomic memory store for source refs, entities, facts, interactions, relationships, and artifacts.
- Added memory review and commit path.
- Added briefing evidence trace and fact retrieval tracking.
- Added memory lint report.
- Preserved V0.2 host-model compatibility.
```

- [ ] **步骤 3：更新公开仓库卫生检查**

`scripts/check-public-repo.mjs` 需要禁止以下内容进入公开包：

```plaintext
memory-store.real
memory-store.private
relationship-memory/runtime/stores/
真实用户材料
本地绝对路径
飞书草稿链接
```

- [ ] **步骤 4：运行发布前检查**

```bash
npm test
npm run test:memory
npm run test:host-model
node scripts/check-public-repo.mjs
npm pack --dry-run --json
```

预期：全部通过，且 npm pack 不包含 runtime stores、真实用户材料或飞书草稿。

- [ ] **步骤 5：提交**

```bash
git add README.md README.zh-CN.md CHANGELOG.md docs scripts package.json
git commit -m "docs: document v0.3 memory release surface"
```

---

## 8. 最终集成门槛

- [ ] **步骤 1：检查分支状态**

```bash
git status --short --branch
```

预期：工作区干净。

- [ ] **步骤 2：运行完整测试**

```bash
npm test
npm run test:memory
npm run test:host-model
git diff --check
```

预期：全部通过。

- [ ] **步骤 3：推送私有功能分支**

```bash
git push -u private feature/v0.3-memory-mvp
```

- [ ] **步骤 4：创建 PR 到私有 `develop`**

PR 信息：

```plaintext
base: develop
compare: feature/v0.3-memory-mvp
title: feat: add v0.3 atomic memory MVP
```

PR 描述必须包含：

```markdown
## Summary

Adds CoStar V0.3 atomic memory MVP: store, candidates, review/commit, briefing evidence, memory lint, and docs.

## Verification

- npm test
- npm run test:memory
- npm run test:host-model
- node scripts/check-public-repo.mjs
- npm pack --dry-run --json
```

---

## 9. 完成定义

只有同时满足以下条件，才能认为 V0.3 Memory MVP 工程完成：

- Atomic memory store 是长期事实源。
- profile/view/graph 仍能工作，但不成为第二套事实源。
- capture 能产生 memory candidates。
- 用户能看到候选事实并确认、修改、拒绝。
- commit 结果进入同一套 store / schema / review / commit 体系。
- briefing 能展示 evidence trace。
- memory lint 能输出健康报告。
- V0.2 host-model 闭环不回退。
- 公开仓库卫生检查通过。
- Claude / Codex / OpenClaw / CatPaw 的验收计划有明确结果。
