# CoStar V0.3 Memory MVP 技术实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CoStar V0.3's trusted atomic memory foundation without breaking the V0.2 host-model workflow.

**Architecture:** Add a focused `costar-core/memory/` module as the long-term durable truth layer, then adapt existing capture, review, commit, briefing, graph, view, and host-model tools around it. Existing profile/view/graph stores remain compatible views; they must not become a second independent data world.

**Tech Stack:** Node.js ESM, JSON Schema draft 2020-12, local JSON stores, existing CoStar host-model dispatcher, existing review/commit protocol, npm test suite.

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

---

## 0. Branch And Release Discipline

All implementation should happen in the private repository first.

- Private repo: `https://github.com/Mechanics130/costar_agent-lenny1`
- Public repo: `https://github.com/Mechanics130/costar_agent`
- Base branch: `develop`
- Feature branch: `feature/v0.3-memory-mvp`
- Release branch later: `release/v0.3.0`

Before starting implementation:

- [ ] **Step 1: Sync develop**

Run:

```bash
git switch develop
git pull --ff-only private develop
```

Expected: `Already up to date.` or a clean fast-forward.

- [ ] **Step 2: Create feature branch**

Run:

```bash
git switch -c feature/v0.3-memory-mvp
```

Expected: new branch created from `develop`.

- [ ] **Step 3: Keep public-release docs in mind**

Do not update the public repository until V0.3 is ready. At release time, update:

```plaintext
README.md
README.zh-CN.md
CHANGELOG.md
docs/support-matrix.md
docs/tester-package.md
```

---

## 1. File Structure Map

Create a focused memory module and keep existing modules as adapters.

### New Files

- `costar-core/memory/memory-store.mjs`
  - Load, normalize, validate, and write the atomic memory store.
- `costar-core/memory/memory-ids.mjs`
  - Generate stable IDs for sources, entities, facts, interactions, relationships, and artifacts.
- `costar-core/memory/memory-candidates.mjs`
  - Convert host extraction output into memory candidates.
- `costar-core/memory/memory-review.mjs`
  - Build memory review cards and translate accepted/edited/rejected answers.
- `costar-core/memory/memory-commit.mjs`
  - Commit accepted memory candidates into the atomic memory store.
- `costar-core/memory/memory-retrieval.mjs`
  - Search and rank facts for briefing.
- `costar-core/memory/memory-lint.mjs`
  - Produce memory health reports.
- `costar-core/memory/memory-store-smoke.mjs`
  - Test memory store read/write/normalization.
- `costar-core/memory/memory-candidates-smoke.mjs`
  - Test candidate normalization and SPECULATIVE guardrails.
- `costar-core/memory/memory-commit-smoke.mjs`
  - Test review/commit writes atomic records and commit log references.
- `costar-core/memory/memory-briefing-smoke.mjs`
  - Test briefing evidence trace and retrieval count update.
- `costar-core/memory/memory-lint-smoke.mjs`
  - Test lint report categories.
- `costar-core/memory/schemas/memory-store.schema.json`
  - Atomic memory store schema.
- `costar-core/memory/samples/memory-store.empty.example.json`
  - Empty store example.
- `costar-core/memory/samples/memory-candidates.request.example.json`
  - Candidate extraction sample.
- `costar-core/memory/samples/memory-lint.response.example.md`
  - Expected lint report shape.

### Modified Files

- `costar-core/tools/tool-contract.mjs`
  - Add memory tools to host-model contract.
- `costar-core/tools/host-model-dispatcher.mjs`
  - Route memory tools to `costar-core/memory/*`.
- `costar-core/commit/costar-commit.mjs`
  - Add `memory_review` as a commit target.
- `costar-core/commit/commit-log-store.mjs`
  - Keep existing API; only ensure memory commit logs resolve correctly.
- `costar-core/host-model-workflows/capture-workflow.mjs`
  - Add optional `memory_candidates` and `source_refs` to capture output.
- `costar-core/host-model-workflows/briefing-workflow.mjs`
  - Use memory retrieval when memory store is available; attach evidence trace.
- `relationship-briefing/runtime/relationship-briefing.mjs`
  - Normalize `facts_included` and artifact metadata in engine mode too.
- `bin/costar.mjs`
  - Add `costar memory lint`, `costar memory get`, and `costar memory search`.
- `package.json`
  - Add memory smoke tests to `test:host-model` or a new `test:memory` script.

---

## 2. Task 1: Atomic Memory Store

**Files:**

- Create: `costar-core/memory/schemas/memory-store.schema.json`
- Create: `costar-core/memory/samples/memory-store.empty.example.json`
- Create: `costar-core/memory/memory-store.mjs`
- Create: `costar-core/memory/memory-ids.mjs`
- Create: `costar-core/memory/memory-store-smoke.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the schema**

Create `costar-core/memory/schemas/memory-store.schema.json` with top-level arrays:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://raw.githubusercontent.com/Mechanics130/costar_agent/main/costar-core/memory/schemas/memory-store.schema.json",
  "title": "CoStar Atomic Memory Store",
  "type": "object",
  "additionalProperties": false,
  "required": ["version", "updated_at", "sources", "entities", "candidates", "facts", "interactions", "relationships", "artifacts"],
  "properties": {
    "version": { "type": "string" },
    "updated_at": { "type": "string" },
    "sources": { "type": "array", "items": { "$ref": "#/$defs/source_ref" } },
    "entities": { "type": "array", "items": { "$ref": "#/$defs/entity" } },
    "candidates": { "type": "array", "items": { "$ref": "#/$defs/candidate" } },
    "facts": { "type": "array", "items": { "$ref": "#/$defs/fact" } },
    "interactions": { "type": "array", "items": { "$ref": "#/$defs/interaction" } },
    "relationships": { "type": "array", "items": { "$ref": "#/$defs/relationship" } },
    "artifacts": { "type": "array", "items": { "$ref": "#/$defs/artifact_ref" } }
  },
  "$defs": {
    "source_ref": {
      "type": "object",
      "additionalProperties": false,
      "required": ["source_id", "source_type", "source_title", "ingested_at"],
      "properties": {
        "source_id": { "type": "string" },
        "source_type": { "type": "string" },
        "source_title": { "type": "string" },
        "source_date": { "type": "string" },
        "ingested_at": { "type": "string" },
        "ingested_by": { "type": "string" },
        "hash": { "type": "string" },
        "size": { "type": "integer", "minimum": 0 },
        "privacy_level": { "type": "string", "enum": ["normal", "sensitive"] },
        "retention_policy": { "type": "string", "enum": ["metadata_only", "excerpt_only", "full_text_local"] }
      }
    },
    "entity": {
      "type": "object",
      "additionalProperties": false,
      "required": ["entity_id", "entity_type", "canonical_name", "status"],
      "properties": {
        "entity_id": { "type": "string" },
        "entity_type": { "type": "string", "enum": ["person", "organization", "project", "topic"] },
        "canonical_name": { "type": "string" },
        "aliases": { "type": "array", "items": { "type": "string" } },
        "key_attributes": { "type": "object" },
        "first_seen_at": { "type": "string" },
        "last_updated_at": { "type": "string" },
        "status": { "type": "string", "enum": ["active", "archived", "merged"] },
        "merged_into": { "type": ["string", "null"] }
      }
    },
    "candidate": {
      "type": "object",
      "additionalProperties": false,
      "required": ["candidate_id", "candidate_type", "suggested_action", "confidence", "source_id", "source_excerpt", "review_status"],
      "properties": {
        "candidate_id": { "type": "string" },
        "candidate_type": { "type": "string", "enum": ["entity", "fact", "interaction", "relationship"] },
        "suggested_action": { "type": "string", "enum": ["create_new", "update_existing", "reject", "conflict_with_existing"] },
        "target_entity_hint": { "type": "object" },
        "proposed_value": { "type": "object" },
        "confidence": { "type": "string", "enum": ["confirmed", "inferred", "speculative"] },
        "source_id": { "type": "string" },
        "source_excerpt": { "type": "string" },
        "review_status": { "type": "string", "enum": ["pending", "accepted", "edited", "rejected"] }
      }
    },
    "fact": {
      "type": "object",
      "additionalProperties": false,
      "required": ["fact_id", "entity_id", "fact_type", "value", "confidence", "source_id", "date_committed", "status", "review", "quality"],
      "properties": {
        "fact_id": { "type": "string" },
        "entity_id": { "type": "string" },
        "fact_type": { "type": "string", "enum": ["role", "preference", "concern", "style", "constraint", "commitment", "history", "need", "issue", "attitude_intent"] },
        "value": { "type": "string" },
        "confidence": { "type": "string", "enum": ["confirmed", "inferred", "speculative"] },
        "source_id": { "type": "string" },
        "source_excerpt": { "type": "string" },
        "date_observed": { "type": "string" },
        "date_committed": { "type": "string" },
        "status": { "type": "string", "enum": ["active", "flagged", "superseded", "archived"] },
        "superseded_by": { "type": ["string", "null"] },
        "review": { "type": "object" },
        "quality": { "type": "object" }
      }
    },
    "interaction": {
      "type": "object",
      "additionalProperties": false,
      "required": ["interaction_id", "participants", "source_id", "interaction_date", "summary"],
      "properties": {
        "interaction_id": { "type": "string" },
        "participants": { "type": "array", "items": { "type": "string" } },
        "source_id": { "type": "string" },
        "interaction_date": { "type": "string" },
        "summary": { "type": "string" },
        "issue_map": { "type": "array" },
        "attitudes": { "type": "array" },
        "needs": { "type": "array" },
        "facts_created": { "type": "array", "items": { "type": "string" } }
      }
    },
    "relationship": {
      "type": "object",
      "additionalProperties": false,
      "required": ["relationship_id", "source_entity_id", "target_entity_id", "relationship_category", "relationship_roles", "confidence", "status"],
      "properties": {
        "relationship_id": { "type": "string" },
        "source_entity_id": { "type": "string" },
        "target_entity_id": { "type": "string" },
        "relationship_category": { "type": "string" },
        "relationship_roles": { "type": "array", "items": { "type": "string" } },
        "confidence": { "type": "string", "enum": ["confirmed", "inferred", "speculative"] },
        "source_id": { "type": "string" },
        "source_excerpt": { "type": "string" },
        "status": { "type": "string", "enum": ["active", "flagged", "archived"] },
        "evidence_fact_ids": { "type": "array", "items": { "type": "string" } }
      }
    },
    "artifact_ref": {
      "type": "object",
      "additionalProperties": false,
      "required": ["artifact_id", "artifact_type", "created_at"],
      "properties": {
        "artifact_id": { "type": "string" },
        "artifact_type": { "type": "string", "enum": ["briefing", "view", "graph", "lint_report"] },
        "created_at": { "type": "string" },
        "target_entities": { "type": "array", "items": { "type": "string" } },
        "facts_included": { "type": "array", "items": { "type": "string" } },
        "interactions_included": { "type": "array", "items": { "type": "string" } },
        "source_refs": { "type": "array", "items": { "type": "string" } },
        "file_path": { "type": "string" },
        "user_feedback": { "type": ["object", "null"] }
      }
    }
  }
}
```

- [ ] **Step 2: Write the empty sample**

Create `costar-core/memory/samples/memory-store.empty.example.json`:

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

- [ ] **Step 3: Write the failing smoke test**

Create `costar-core/memory/memory-store-smoke.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEmptyMemoryStore,
  loadMemoryStore,
  writeMemoryStore
} from "./memory-store.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-store-"));

try {
  const storePath = path.join(tmp, "memory-store.json");
  const empty = createEmptyMemoryStore("0.3.0");
  assert.equal(empty.version, "0.3.0");
  assert.deepEqual(empty.facts, []);

  const loaded = loadMemoryStore({ storePath });
  assert.equal(loaded.store_path, storePath);
  assert.deepEqual(loaded.entities, []);

  const written = writeMemoryStore({
    storePath,
    store: {
      ...empty,
      updated_at: "2026-04-30T00:00:00.000Z",
      sources: [{
        source_id: "src_test",
        source_type: "meeting_note",
        source_title: "Mock note",
        ingested_at: "2026-04-30T00:00:00.000Z",
        privacy_level: "normal",
        retention_policy: "metadata_only"
      }]
    }
  });

  assert.equal(written.written, true);
  assert.equal(loadMemoryStore({ storePath }).sources[0].source_id, "src_test");
  console.log("memory-store-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
```

- [ ] **Step 4: Run the smoke test and confirm it fails**

Run:

```bash
node costar-core/memory/memory-store-smoke.mjs
```

Expected: failure because `memory-store.mjs` does not exist.

- [ ] **Step 5: Implement memory IDs**

Create `costar-core/memory/memory-ids.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0

export function stableMemoryId(prefix, parts) {
  const body = (Array.isArray(parts) ? parts : [parts])
    .map((part) => normalizeIdPart(part))
    .filter(Boolean)
    .join("-");
  return `${prefix}_${body || "unknown"}`;
}

export function normalizeIdPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
```

- [ ] **Step 6: Implement memory store**

Create `costar-core/memory/memory-store.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import { readJsonStore, resolveStorePath, writeJsonStore, normalizeString } from "../stores/json-store-utils.mjs";

export const MEMORY_STORE_VERSION = "0.3.0";

export function createEmptyMemoryStore(version = MEMORY_STORE_VERSION) {
  return {
    version,
    updated_at: "",
    sources: [],
    entities: [],
    candidates: [],
    facts: [],
    interactions: [],
    relationships: [],
    artifacts: []
  };
}

export function loadMemoryStore({ storePath, defaultStorePath = "" }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const parsed = readJsonStore(targetPath, () => createEmptyMemoryStore());
  return normalizeMemoryStore(parsed, targetPath);
}

export function writeMemoryStore({ storePath, defaultStorePath = "", store, processedAt = "" }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const normalized = normalizeMemoryStore({
    ...store,
    updated_at: processedAt || store?.updated_at || new Date().toISOString()
  }, targetPath);
  const { store_path, ...payload } = normalized;
  writeJsonStore(targetPath, payload);
  return {
    store: payload,
    store_path: targetPath,
    written: true,
    counts: countMemoryRecords(payload)
  };
}

export function normalizeMemoryStore(value, storePath = "") {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : createEmptyMemoryStore();
  return {
    store_path: storePath,
    version: normalizeString(source.version) || MEMORY_STORE_VERSION,
    updated_at: normalizeString(source.updated_at),
    sources: normalizeArray(source.sources),
    entities: normalizeArray(source.entities),
    candidates: normalizeArray(source.candidates),
    facts: normalizeArray(source.facts),
    interactions: normalizeArray(source.interactions),
    relationships: normalizeArray(source.relationships),
    artifacts: normalizeArray(source.artifacts)
  };
}

export function countMemoryRecords(store) {
  return {
    sources: normalizeArray(store?.sources).length,
    entities: normalizeArray(store?.entities).length,
    candidates: normalizeArray(store?.candidates).length,
    facts: normalizeArray(store?.facts).length,
    interactions: normalizeArray(store?.interactions).length,
    relationships: normalizeArray(store?.relationships).length,
    artifacts: normalizeArray(store?.artifacts).length
  };
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];
}
```

- [ ] **Step 7: Run the smoke test and confirm it passes**

Run:

```bash
node costar-core/memory/memory-store-smoke.mjs
```

Expected: `memory-store-smoke passed`.

- [ ] **Step 8: Add npm script**

Modify `package.json`:

```json
"test:memory": "node costar-core/memory/memory-store-smoke.mjs"
```

Run:

```bash
npm run test:memory
```

Expected: smoke test passes.

- [ ] **Step 9: Commit**

Run:

```bash
git add costar-core/memory package.json
git commit -m "feat: add atomic memory store foundation"
```

---

## 3. Task 2: Memory Candidates And SPECULATIVE Guardrails

**Files:**

- Create: `costar-core/memory/memory-candidates.mjs`
- Create: `costar-core/memory/memory-candidates-smoke.mjs`
- Create: `costar-core/memory/samples/memory-candidates.request.example.json`
- Modify: `costar-core/host-model-workflows/capture-workflow.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write candidate smoke test**

Create `costar-core/memory/memory-candidates-smoke.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { buildMemoryCandidatesFromIngestion } from "./memory-candidates.mjs";

const result = buildMemoryCandidatesFromIngestion({
  source_manifest: [{
    source_id: "src_001",
    source_type: "meeting_note",
    source_title: "Mock meeting",
    captured_at: "2026-04-30"
  }],
  person_profiles: [{
    person_name: "Riley Chen",
    person_ref: "person_riley_chen",
    confidence: "medium",
    compiled_truth: {
      summary: "Riley cares about launch risk.",
      boundaries: ["Needs rollback plan before launch."],
      risk_flags: ["Launch date may slip without risk plan."]
    },
    evidence_summary: {
      key_evidence: ["Riley asked for rollback plan twice."]
    }
  }]
});

assert.equal(result.source_refs.length, 1);
assert.equal(result.candidates.some((item) => item.candidate_type === "entity"), true);
assert.equal(result.candidates.some((item) => item.candidate_type === "fact"), true);
assert.equal(result.candidates.every((item) => item.review_status === "pending"), true);
assert.equal(result.candidates.every((item) => item.source_excerpt.length > 0), true);

const speculative = result.candidates.find((item) => item.confidence === "speculative");
if (speculative) {
  assert.notEqual(speculative.suggested_action, "create_new");
}

console.log("memory-candidates-smoke passed");
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
node costar-core/memory/memory-candidates-smoke.mjs
```

Expected: failure because `memory-candidates.mjs` does not exist.

- [ ] **Step 3: Implement candidate builder**

Create `costar-core/memory/memory-candidates.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import { stableMemoryId } from "./memory-ids.mjs";

const FIELD_TO_FACT_TYPE = {
  role: "role",
  preferences: "preference",
  boundaries: "constraint",
  risk_flags: "concern",
  next_actions: "commitment",
  latent_needs: "need",
  key_issues: "issue",
  attitude_intent: "attitude_intent"
};

export function buildMemoryCandidatesFromIngestion(ingestionResult) {
  const sourceRefs = normalizeSourceRefs(ingestionResult?.source_manifest);
  const defaultSource = sourceRefs[0] || {
    source_id: "src_unknown",
    source_type: "unknown",
    source_title: "Unknown source",
    ingested_at: new Date().toISOString(),
    privacy_level: "normal",
    retention_policy: "metadata_only"
  };
  const profiles = Array.isArray(ingestionResult?.person_profiles) ? ingestionResult.person_profiles : [];
  const candidates = profiles.flatMap((profile) => buildCandidatesForProfile(profile, defaultSource));
  return {
    source_refs: sourceRefs.length ? sourceRefs : [defaultSource],
    candidates
  };
}

function buildCandidatesForProfile(profile, sourceRef) {
  const personName = normalizeString(profile?.person_name);
  const personRef = normalizeString(profile?.person_ref) || stableMemoryId("person", personName);
  const evidence = firstEvidence(profile);
  const items = [{
    candidate_id: stableMemoryId("cand_entity", [sourceRef.source_id, personRef]),
    candidate_type: "entity",
    suggested_action: "create_new",
    target_entity_hint: {
      entity_type: "person",
      name: personName,
      matched_entity_id: null
    },
    proposed_value: {
      entity_type: "person",
      canonical_name: personName,
      aliases: []
    },
    confidence: normalizeConfidence(profile?.confidence),
    source_id: sourceRef.source_id,
    source_excerpt: evidence,
    review_status: "pending"
  }];

  const truth = profile?.compiled_truth && typeof profile.compiled_truth === "object" ? profile.compiled_truth : {};
  for (const [field, factType] of Object.entries(FIELD_TO_FACT_TYPE)) {
    for (const value of normalizeFactValues(truth[field])) {
      const confidence = factType === "attitude_intent" || factType === "need" ? "speculative" : normalizeConfidence(profile?.confidence);
      items.push({
        candidate_id: stableMemoryId("cand_fact", [sourceRef.source_id, personRef, factType, value]),
        candidate_type: "fact",
        suggested_action: confidence === "speculative" ? "update_existing" : "create_new",
        target_entity_hint: {
          entity_type: "person",
          name: personName,
          matched_entity_id: null
        },
        proposed_value: {
          fact_type: factType,
          value
        },
        confidence,
        source_id: sourceRef.source_id,
        source_excerpt: evidence,
        review_status: "pending"
      });
    }
  }

  return items.filter((item) => item.source_excerpt);
}

function normalizeSourceRefs(values) {
  return (Array.isArray(values) ? values : []).map((source, index) => ({
    source_id: normalizeString(source?.source_id) || `src_${index + 1}`,
    source_type: normalizeString(source?.source_type) || "unknown",
    source_title: normalizeString(source?.source_title) || "Untitled source",
    source_date: normalizeString(source?.captured_at || source?.source_date),
    ingested_at: new Date().toISOString(),
    ingested_by: "user",
    hash: "",
    size: 0,
    privacy_level: "normal",
    retention_policy: "metadata_only"
  }));
}

function normalizeFactValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item?.need || item?.issue || item?.value || item)).filter(Boolean);
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((item) => normalizeFactValues(item));
  }
  const text = normalizeString(value);
  return text ? [text] : [];
}

function firstEvidence(profile) {
  const evidence = profile?.evidence_summary?.key_evidence;
  if (Array.isArray(evidence) && evidence.length) {
    return normalizeString(evidence[0]);
  }
  return normalizeString(profile?.compiled_truth?.summary) || "Source evidence available in imported material.";
}

function normalizeConfidence(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "high") return "confirmed";
  if (normalized === "low") return "speculative";
  if (["confirmed", "inferred", "speculative"].includes(normalized)) return normalized;
  return "inferred";
}

function normalizeString(value) {
  return String(value ?? "").trim();
}
```

- [ ] **Step 4: Run smoke**

Run:

```bash
node costar-core/memory/memory-candidates-smoke.mjs
```

Expected: `memory-candidates-smoke passed`.

- [ ] **Step 5: Attach candidates to capture workflow**

Modify `costar-core/host-model-workflows/capture-workflow.mjs`:

```javascript
import { buildMemoryCandidatesFromIngestion } from "../memory/memory-candidates.mjs";
```

After `response.source = "host_model_adapter";`, add:

```javascript
  const memoryCandidates = buildMemoryCandidatesFromIngestion(ingestionResult);
  response.memory = {
    source_refs: memoryCandidates.source_refs,
    candidates: memoryCandidates.candidates,
    pending_count: memoryCandidates.candidates.length
  };
```

- [ ] **Step 6: Add npm script**

Modify `package.json`:

```json
"test:memory": "node costar-core/memory/memory-store-smoke.mjs && node costar-core/memory/memory-candidates-smoke.mjs"
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test:memory
npm run test:host-model
```

Expected: both pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add costar-core/memory costar-core/host-model-workflows/capture-workflow.mjs package.json
git commit -m "feat: add memory candidates to capture workflow"
```

---

## 4. Task 3: Memory Review And Commit

**Files:**

- Create: `costar-core/memory/memory-review.mjs`
- Create: `costar-core/memory/memory-commit.mjs`
- Create: `costar-core/memory/memory-commit-smoke.mjs`
- Modify: `costar-core/commit/costar-commit.mjs`
- Modify: `costar-core/tools/tool-contract.mjs`
- Modify: `costar-core/tools/host-model-dispatcher.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write commit smoke**

Create `costar-core/memory/memory-commit-smoke.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { commitMemoryReviewDecisions } from "./memory-commit.mjs";
import { loadMemoryStore } from "./memory-store.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-commit-"));

try {
  const storePath = path.join(tmp, "memory-store.json");
  const result = commitMemoryReviewDecisions({
    memory_store_path: storePath,
    operator: "smoke-test",
    source_refs: [{
      source_id: "src_001",
      source_type: "meeting_note",
      source_title: "Mock",
      ingested_at: "2026-04-30T00:00:00.000Z",
      privacy_level: "normal",
      retention_policy: "metadata_only"
    }],
    review_decisions: [{
      decision: "accept",
      candidate: {
        candidate_id: "cand_fact_001",
        candidate_type: "fact",
        suggested_action: "create_new",
        target_entity_hint: { entity_type: "person", name: "Riley Chen" },
        proposed_value: { fact_type: "concern", value: "Riley cares about launch risk." },
        confidence: "inferred",
        source_id: "src_001",
        source_excerpt: "Riley asked for rollback plan twice.",
        review_status: "pending"
      }
    }, {
      decision: "accept",
      candidate: {
        candidate_id: "cand_fact_speculative",
        candidate_type: "fact",
        suggested_action: "create_new",
        target_entity_hint: { entity_type: "person", name: "Riley Chen" },
        proposed_value: { fact_type: "attitude_intent", value: "Riley may be skeptical." },
        confidence: "speculative",
        source_id: "src_001",
        source_excerpt: "Riley sounded cautious.",
        review_status: "pending"
      }
    }]
  });

  assert.equal(result.status, "success");
  assert.equal(result.memory_store_delta.facts_added, 1);
  assert.equal(result.memory_store_delta.candidates_rejected_or_deferred, 1);

  const store = loadMemoryStore({ storePath });
  assert.equal(store.facts.length, 1);
  assert.equal(store.facts[0].confidence, "inferred");
  assert.equal(store.candidates.some((item) => item.confidence === "speculative"), true);

  console.log("memory-commit-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
node costar-core/memory/memory-commit-smoke.mjs
```

Expected: failure because `memory-commit.mjs` does not exist.

- [ ] **Step 3: Implement memory review helpers**

Create `costar-core/memory/memory-review.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0

export function buildMemoryReviewCards({ candidates = [], limit = 10 } = {}) {
  const pending = candidates.filter((item) => item?.review_status === "pending");
  return {
    status: "success",
    source_type: "memory_review",
    pending_count: pending.length,
    prompt_cards: pending.slice(0, limit).map((candidate, index) => ({
      card_id: candidate.candidate_id,
      index: index + 1,
      candidate_type: candidate.candidate_type,
      proposed_value: candidate.proposed_value,
      confidence: candidate.confidence,
      source_excerpt: candidate.source_excerpt,
      question: `Accept, edit, or reject this ${candidate.candidate_type} candidate?`,
      answer_schema: {
        decision: "accept | edit | reject",
        edited_value: "required only when decision is edit",
        note: "optional"
      }
    }))
  };
}

export function translateMemoryReviewAnswers({ candidates = [], answers = [] } = {}) {
  const byId = new Map(candidates.map((item) => [item.candidate_id, item]));
  return answers.map((answer) => ({
    decision: normalizeDecision(answer?.decision),
    candidate: byId.get(answer?.card_id) || byId.get(answer?.candidate_id),
    edited_value: answer?.edited_value || null,
    note: String(answer?.note ?? "").trim()
  })).filter((item) => item.candidate);
}

function normalizeDecision(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["accept", "edit", "reject"].includes(normalized) ? normalized : "reject";
}
```

- [ ] **Step 4: Implement memory commit**

Create `costar-core/memory/memory-commit.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import { stableMemoryId } from "./memory-ids.mjs";
import { loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";

export function commitMemoryReviewDecisions(payload) {
  const processedAt = new Date().toISOString();
  const storePath = payload.memory_store_path;
  const store = loadMemoryStore({ storePath });
  const next = {
    ...store,
    sources: mergeById(store.sources, payload.source_refs || [], "source_id"),
    entities: [...store.entities],
    candidates: [...store.candidates],
    facts: [...store.facts],
    interactions: [...store.interactions],
    relationships: [...store.relationships],
    artifacts: [...store.artifacts]
  };

  let factsAdded = 0;
  let deferred = 0;

  for (const decision of payload.review_decisions || []) {
    const candidate = decision.candidate;
    if (!candidate || decision.decision === "reject") {
      deferred += 1;
      continue;
    }
    next.candidates.push({ ...candidate, review_status: decision.decision === "edit" ? "edited" : "accepted" });

    if (candidate.candidate_type === "fact") {
      if (candidate.confidence === "speculative") {
        deferred += 1;
        continue;
      }
      const entity = ensureEntity(next.entities, candidate, processedAt);
      const value = decision.edited_value?.value || candidate.proposed_value?.value || "";
      next.facts.push({
        fact_id: stableMemoryId("fact", [entity.entity_id, candidate.proposed_value?.fact_type, value]),
        entity_id: entity.entity_id,
        fact_type: candidate.proposed_value?.fact_type || "history",
        value,
        confidence: candidate.confidence || "inferred",
        source_id: candidate.source_id,
        source_excerpt: candidate.source_excerpt,
        date_observed: "",
        date_committed: processedAt,
        status: "active",
        superseded_by: null,
        review: {
          reviewed_by: payload.operator || "user",
          reviewed_at: processedAt,
          decision: decision.decision
        },
        quality: {
          retrieval_count: 0,
          last_retrieved_at: null,
          user_marked_useful_count: 0,
          user_marked_wrong_count: 0
        }
      });
      factsAdded += 1;
    }
  }

  const write = writeMemoryStore({ storePath, store: next, processedAt });
  return {
    status: "success",
    memory_store_path: write.store_path,
    memory_store_delta: {
      facts_added: factsAdded,
      candidates_rejected_or_deferred: deferred
    },
    committed_records: {
      facts: factsAdded
    },
    user_feedback: {
      summary: `Committed ${factsAdded} memory facts. Deferred or rejected ${deferred} candidates.`
    }
  };
}

function ensureEntity(entities, candidate, processedAt) {
  const name = candidate.target_entity_hint?.name || "Unknown person";
  const existing = entities.find((item) => item.canonical_name === name);
  if (existing) return existing;
  const entity = {
    entity_id: stableMemoryId("ent_person", name),
    entity_type: "person",
    canonical_name: name,
    aliases: [],
    key_attributes: {},
    first_seen_at: processedAt,
    last_updated_at: processedAt,
    status: "active",
    merged_into: null
  };
  entities.push(entity);
  return entity;
}

function mergeById(left, right, key) {
  const map = new Map(left.map((item) => [item[key], item]));
  for (const item of right) map.set(item[key], { ...(map.get(item[key]) || {}), ...item });
  return Array.from(map.values());
}
```

- [ ] **Step 5: Run smoke**

Run:

```bash
node costar-core/memory/memory-commit-smoke.mjs
```

Expected: `memory-commit-smoke passed`.

- [ ] **Step 6: Wire commit target**

Modify `costar-core/commit/costar-commit.mjs`:

- Import `commitMemoryReviewDecisions`.
- Add `memory_review` to `COMMIT_TARGETS`.
- In `runCoStarCommit`, route `request.target === "memory_review"` to `commitMemoryReviewDecisions(request.commit_request)`.
- In validation, allow `commit_request.memory_store_path`, `source_refs`, and `review_decisions`.

- [ ] **Step 7: Wire tool contract and dispatcher**

Modify `costar-core/tools/tool-contract.mjs` to add:

```javascript
{
  name: "memory_review_prepare_cards",
  category: "deterministic",
  read_only: true,
  requires_host_reasoning: false,
  purpose: "Turn memory candidates into stable review cards.",
  input_contract: { required: ["candidates"], optional: ["limit"] },
  output_contract: { primary_fields: ["status", "pending_count", "prompt_cards"] },
  side_effects: [],
  receipt_required: false,
  commit_target: null
}
```

Add `memory_review_translate_answers` and `memory_commit_decisions` with the same contract style.

Modify `costar-core/tools/host-model-dispatcher.mjs`:

```javascript
case "memory_review_prepare_cards":
  return buildMemoryReviewCards(toolInput);
case "memory_review_translate_answers":
  return { target: "memory_review", commit_request: { ...toolInput, review_decisions: translateMemoryReviewAnswers(toolInput) } };
case "memory_commit_decisions":
  return runCoStarCommit({ target: "memory_review", commit_request: toolInput });
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm run test:memory
npm run test:host-model
```

Expected: all pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add costar-core/memory costar-core/commit costar-core/tools package.json
git commit -m "feat: add memory review commit path"
```

---

## 5. Task 4: Briefing Evidence Trace And ArtifactRef

**Files:**

- Create: `costar-core/memory/memory-retrieval.mjs`
- Create: `costar-core/memory/memory-briefing-smoke.mjs`
- Modify: `costar-core/host-model-workflows/briefing-workflow.mjs`
- Modify: `relationship-briefing/runtime/relationship-briefing.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write briefing evidence smoke**

Create `costar-core/memory/memory-briefing-smoke.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { searchFactsForBriefing, recordBriefingArtifact } from "./memory-retrieval.mjs";
import { createEmptyMemoryStore, loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-briefing-"));

try {
  const storePath = path.join(tmp, "memory-store.json");
  writeMemoryStore({
    storePath,
    store: {
      ...createEmptyMemoryStore(),
      entities: [{ entity_id: "ent_riley", entity_type: "person", canonical_name: "Riley Chen", aliases: [], key_attributes: {}, first_seen_at: "", last_updated_at: "", status: "active", merged_into: null }],
      facts: [{
        fact_id: "fact_risk",
        entity_id: "ent_riley",
        fact_type: "concern",
        value: "Riley cares about rollback plans.",
        confidence: "confirmed",
        source_id: "src_001",
        source_excerpt: "Riley asked for rollback twice.",
        date_observed: "2026-04-30",
        date_committed: "2026-04-30T00:00:00.000Z",
        status: "active",
        superseded_by: null,
        review: {},
        quality: { retrieval_count: 0, last_retrieved_at: null, user_marked_useful_count: 0, user_marked_wrong_count: 0 }
      }]
    }
  });

  const hits = searchFactsForBriefing({ storePath, personName: "Riley Chen", conversationGoal: "Prepare launch review." });
  assert.equal(hits.facts_included[0].fact_id, "fact_risk");

  recordBriefingArtifact({ storePath, targetEntities: ["ent_riley"], factsIncluded: hits.facts_included, artifactPath: "mock.md" });
  const store = loadMemoryStore({ storePath });
  assert.equal(store.artifacts.length, 1);
  assert.equal(store.facts[0].quality.retrieval_count, 1);

  console.log("memory-briefing-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
node costar-core/memory/memory-briefing-smoke.mjs
```

Expected: failure because `memory-retrieval.mjs` does not exist.

- [ ] **Step 3: Implement retrieval and artifact**

Create `costar-core/memory/memory-retrieval.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import { stableMemoryId } from "./memory-ids.mjs";
import { loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";

export function searchFactsForBriefing({ storePath, personName, conversationGoal = "", limit = 8 }) {
  const store = loadMemoryStore({ storePath });
  const entity = store.entities.find((item) => normalize(item.canonical_name) === normalize(personName));
  if (!entity) return { target_entity: null, facts_included: [] };
  const facts = store.facts
    .filter((fact) => fact.entity_id === entity.entity_id && fact.status === "active")
    .map((fact) => ({ ...fact, score: scoreFact(fact, conversationGoal) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return {
    target_entity: entity,
    facts_included: facts.map((fact) => ({
      fact_id: fact.fact_id,
      entity_id: fact.entity_id,
      fact_type: fact.fact_type,
      value: fact.value,
      confidence: fact.confidence,
      source_id: fact.source_id,
      source_excerpt: fact.source_excerpt,
      score: fact.score
    }))
  };
}

export function recordBriefingArtifact({ storePath, targetEntities = [], factsIncluded = [], artifactPath = "" }) {
  const processedAt = new Date().toISOString();
  const store = loadMemoryStore({ storePath });
  const includedIds = new Set(factsIncluded.map((fact) => fact.fact_id));
  const nextFacts = store.facts.map((fact) => {
    if (!includedIds.has(fact.fact_id)) return fact;
    return {
      ...fact,
      quality: {
        ...(fact.quality || {}),
        retrieval_count: Number(fact.quality?.retrieval_count || 0) + 1,
        last_retrieved_at: processedAt
      }
    };
  });
  const artifact = {
    artifact_id: stableMemoryId("art_briefing", [processedAt, artifactPath || "memory"]),
    artifact_type: "briefing",
    created_at: processedAt,
    target_entities: targetEntities,
    facts_included: Array.from(includedIds),
    interactions_included: [],
    source_refs: Array.from(new Set(factsIncluded.map((fact) => fact.source_id).filter(Boolean))),
    file_path: artifactPath,
    user_feedback: null
  };
  return writeMemoryStore({
    storePath,
    store: {
      ...store,
      facts: nextFacts,
      artifacts: [...store.artifacts, artifact]
    },
    processedAt
  });
}

function scoreFact(fact, goal) {
  const confidence = { confirmed: 1, inferred: 0.7, speculative: 0.3 }[fact.confidence] || 0.5;
  const goalText = normalize(goal);
  const relevance = goalText && normalize(fact.value).split(" ").some((part) => goalText.includes(part)) ? 1 : 0.6;
  const utility = 1 + Math.log1p(Number(fact.quality?.retrieval_count || 0));
  return Number((confidence * relevance * utility).toFixed(4));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}
```

- [ ] **Step 4: Run smoke**

Run:

```bash
node costar-core/memory/memory-briefing-smoke.mjs
```

Expected: `memory-briefing-smoke passed`.

- [ ] **Step 5: Attach evidence to briefing workflow**

Modify `costar-core/host-model-workflows/briefing-workflow.mjs`:

- Import `searchFactsForBriefing` and `recordBriefingArtifact`.
- If `payload.memory_store_path` exists, call `searchFactsForBriefing`.
- Add `memory_evidence` to response.
- After writing briefing markdown, call `recordBriefingArtifact`.

The response shape should include:

```javascript
response.memory_evidence = {
  target_entity: memoryHits.target_entity,
  facts_included: memoryHits.facts_included,
  evidence_trace_available: memoryHits.facts_included.length > 0
};
```

- [ ] **Step 6: Keep engine-mode briefing compatible**

Modify `relationship-briefing/runtime/relationship-briefing.mjs` so `normalizeBriefingOutput` preserves:

```javascript
facts_included
memory_evidence
```

when supplied by host-model workflow.

- [ ] **Step 7: Update npm script and run**

Run:

```bash
npm run test:memory
npm run test:host-model
```

Expected: all pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add costar-core/memory costar-core/host-model-workflows/briefing-workflow.mjs relationship-briefing/runtime/relationship-briefing.mjs package.json
git commit -m "feat: add briefing memory evidence trace"
```

---

## 6. Task 5: Memory Lint And CLI

**Files:**

- Create: `costar-core/memory/memory-lint.mjs`
- Create: `costar-core/memory/memory-lint-smoke.mjs`
- Create: `costar-core/memory/samples/memory-lint.response.example.md`
- Modify: `bin/costar.mjs`
- Modify: `costar-core/tools/tool-contract.mjs`
- Modify: `costar-core/tools/host-model-dispatcher.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write lint smoke**

Create `costar-core/memory/memory-lint-smoke.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEmptyMemoryStore, writeMemoryStore } from "./memory-store.mjs";
import { runMemoryLint } from "./memory-lint.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-lint-"));

try {
  const storePath = path.join(tmp, "memory-store.json");
  writeMemoryStore({
    storePath,
    store: {
      ...createEmptyMemoryStore(),
      entities: [{ entity_id: "ent_riley", entity_type: "person", canonical_name: "Riley Chen", aliases: [], key_attributes: {}, first_seen_at: "", last_updated_at: "", status: "active", merged_into: null }],
      facts: [{
        fact_id: "fact_old_commitment",
        entity_id: "ent_riley",
        fact_type: "commitment",
        value: "Send rollback plan by 2026-01-01.",
        confidence: "confirmed",
        source_id: "src_001",
        source_excerpt: "Send it by Jan 1.",
        date_observed: "2026-01-01",
        date_committed: "2026-01-01T00:00:00.000Z",
        status: "active",
        superseded_by: null,
        review: {},
        quality: { retrieval_count: 0, last_retrieved_at: null, user_marked_useful_count: 0, user_marked_wrong_count: 0 }
      }]
    }
  });

  const report = runMemoryLint({ storePath, now: "2026-04-30T00:00:00.000Z" });
  assert.equal(report.issue_counts.overdue_commitments, 1);
  assert.match(report.markdown_report, /过期承诺/);
  assert.match(report.markdown_report, /僵尸 fact/);
  console.log("memory-lint-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run and confirm failure**

Run:

```bash
node costar-core/memory/memory-lint-smoke.mjs
```

Expected: failure because `memory-lint.mjs` does not exist.

- [ ] **Step 3: Implement lint**

Create `costar-core/memory/memory-lint.mjs`:

```javascript
// SPDX-License-Identifier: Apache-2.0
import { loadMemoryStore } from "./memory-store.mjs";

export function runMemoryLint({ storePath, now = new Date().toISOString(), zombieDays = 90 } = {}) {
  const store = loadMemoryStore({ storePath });
  const nowMs = Date.parse(now);
  const overdueCommitments = store.facts.filter((fact) => fact.fact_type === "commitment" && fact.status === "active" && isOlderThan(fact.date_observed, nowMs, 30));
  const zombieFacts = store.facts.filter((fact) => fact.status === "active" && Number(fact.quality?.retrieval_count || 0) === 0 && isOlderThan(fact.date_committed, nowMs, zombieDays));
  const isolatedEntities = store.entities.filter((entity) => !store.facts.some((fact) => fact.entity_id === entity.entity_id));
  const contradictionGroups = findPotentialContradictions(store.facts);
  const knowledgeGaps = store.entities.filter((entity) => store.facts.filter((fact) => fact.entity_id === entity.entity_id).length < 2);

  const markdown = [
    "# CoStar Memory Lint Report",
    "",
    "## 过期承诺",
    ...formatFactList(overdueCommitments),
    "",
    "## 僵尸 fact",
    ...formatFactList(zombieFacts),
    "",
    "## 孤立人物",
    ...formatEntityList(isolatedEntities),
    "",
    "## 可能矛盾事实",
    ...formatContradictions(contradictionGroups),
    "",
    "## 知识缺口",
    ...formatEntityList(knowledgeGaps)
  ].join("\n");

  return {
    status: "success",
    issue_counts: {
      overdue_commitments: overdueCommitments.length,
      zombie_facts: zombieFacts.length,
      isolated_entities: isolatedEntities.length,
      potential_contradictions: contradictionGroups.length,
      knowledge_gaps: knowledgeGaps.length
    },
    markdown_report: markdown
  };
}

function isOlderThan(dateValue, nowMs, days) {
  const valueMs = Date.parse(dateValue || "");
  if (!Number.isFinite(valueMs)) return false;
  return nowMs - valueMs > days * 24 * 60 * 60 * 1000;
}

function findPotentialContradictions(facts) {
  const groups = new Map();
  for (const fact of facts.filter((item) => item.status === "active")) {
    const key = `${fact.entity_id}:${fact.fact_type}`;
    const list = groups.get(key) || [];
    list.push(fact);
    groups.set(key, list);
  }
  return Array.from(groups.values()).filter((items) => items.length > 1);
}

function formatFactList(facts) {
  return facts.length ? facts.map((fact) => `- ${fact.fact_id}: ${fact.value}`) : ["- 无"];
}

function formatEntityList(entities) {
  return entities.length ? entities.map((entity) => `- ${entity.entity_id}: ${entity.canonical_name}`) : ["- 无"];
}

function formatContradictions(groups) {
  return groups.length
    ? groups.map((items) => `- ${items[0].entity_id}/${items[0].fact_type}: ${items.map((item) => item.fact_id).join(", ")}`)
    : ["- 无"];
}
```

- [ ] **Step 4: Run smoke**

Run:

```bash
node costar-core/memory/memory-lint-smoke.mjs
```

Expected: `memory-lint-smoke passed`.

- [ ] **Step 5: Add CLI command**

Modify `bin/costar.mjs`:

- Add `memory` to help.
- Import a helper or call a new runner script for `memory lint`.
- Support:

```bash
costar memory lint --store <path>
```

The output should print the markdown report to stdout.

- [ ] **Step 6: Add dispatcher tool**

Add `memory_lint` to `tool-contract.mjs` and `host-model-dispatcher.mjs`.

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test:memory
npm test
npm run test:host-model
```

Expected: all pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add costar-core/memory bin/costar.mjs costar-core/tools package.json
git commit -m "feat: add memory lint and CLI"
```

---

## 7. Task 6: Documentation, Migration Notes, And Release Readiness

**Files:**

- Create: `docs/memory-v0.3.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/support-matrix.md`
- Modify: `docs/tester-package.md`
- Modify: `scripts/check-public-repo.mjs`

- [ ] **Step 1: Create memory docs**

Create `docs/memory-v0.3.md` with:

```markdown
# CoStar V0.3 Memory

CoStar V0.3 introduces atomic memory: sources, candidates, entities, facts, interactions, relationships, and artifacts.

Atomic memory is the long-term durable truth layer. Profile, view, graph, and briefing are compatible derived views.

## User-Facing Guarantees

- Every accepted memory fact has source evidence.
- SPECULATIVE facts are not written as durable facts unless reviewed.
- Briefing can record which facts it used.
- Memory lint reports outdated, isolated, contradictory, zombie, and missing context.

## Commands

```bash
costar memory lint --store path/to/memory-store.json
```
```

- [ ] **Step 2: Update README files**

Add a V0.3 section to `README.md` and `README.zh-CN.md`:

```markdown
## CoStar V0.3 Memory

V0.3 adds a trusted atomic memory foundation. It keeps source references, reviewable memory candidates, atomic facts, briefing evidence traces, and memory lint reports.
```

- [ ] **Step 3: Update CHANGELOG**

Add:

```markdown
## 0.3.0 - Unreleased

- Added atomic memory store for source refs, entities, facts, interactions, relationships, and artifacts.
- Added memory review and commit path.
- Added briefing evidence trace and fact retrieval tracking.
- Added memory lint report.
- Preserved V0.2 host-model compatibility.
```

- [ ] **Step 4: Add public hygiene checks**

Modify `scripts/check-public-repo.mjs` to ban:

```javascript
"memory-store.real",
"memory-store.private",
"relationship-memory/runtime/stores/"
```

if those patterns appear in public package paths.

- [ ] **Step 5: Run full release checks**

Run:

```bash
npm test
npm run test:memory
npm run test:host-model
node scripts/check-public-repo.mjs
npm pack --dry-run --json
```

Expected: all pass and pack does not include runtime stores, real user materials, or Feishu drafts.

- [ ] **Step 6: Commit**

Run:

```bash
git add README.md README.zh-CN.md CHANGELOG.md docs scripts package.json
git commit -m "docs: document v0.3 memory release surface"
```

---

## 8. Final Integration Gate

- [ ] **Step 1: Verify branch status**

Run:

```bash
git status --short --branch
```

Expected: clean branch.

- [ ] **Step 2: Run full suite**

Run:

```bash
npm test
npm run test:memory
npm run test:host-model
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Push private feature branch**

Run:

```bash
git push -u private feature/v0.3-memory-mvp
```

Expected: private branch pushed.

- [ ] **Step 4: Open PR to private develop**

Use GitHub UI:

```plaintext
base: develop
compare: feature/v0.3-memory-mvp
title: feat: add v0.3 atomic memory MVP
```

PR description must include:

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
