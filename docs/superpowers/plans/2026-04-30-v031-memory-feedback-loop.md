# V0.3.1 Memory Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a lightweight feedback, reflection, and hint loop so CoStar can record user corrections and feed confirmed learning signals into later capture and briefing runs.

**Architecture:** Extend the existing atomic memory store rather than creating a second data world. Feedback events, review diffs, reflection candidates, and extraction hints live in the same JSON store and are exposed through deterministic host-model tools. Host models translate natural language into structured feedback; CoStar stores, validates, and retrieves the resulting signals.

**Tech Stack:** Node.js ESM, JSON memory store, deterministic smoke tests with `node:assert/strict`, existing host-model dispatcher and memory modules.

---

## File Structure

- Modify `costar-core/memory/memory-store.mjs`: add normalized arrays for `feedback_events`, `review_diffs`, `reflection_candidates`, and `hints`.
- Modify `costar-core/memory/schemas/memory-store.schema.json`: document the new arrays while keeping old stores loadable through normalization.
- Modify `costar-core/memory/memory-commit.mjs`: record review diffs during memory review commits.
- Create `costar-core/memory/memory-feedback.mjs`: record feedback, update fact quality counters, create reflection candidates, commit confirmed reflections into hints, and retrieve hints.
- Create `costar-core/memory/memory-feedback-smoke.mjs`: red/green smoke coverage for feedback events, reflection confirmation, and hint retrieval.
- Modify `costar-core/tools/host-model-dispatcher.mjs`: expose `memory_feedback_record`, `memory_reflection_prepare_cards`, `memory_reflection_commit`, and `memory_hints_get`.
- Modify `costar-core/tools/tool-contract.mjs`: publish tool contracts for host-model mode.
- Modify `costar-core/host-model-adapter/host-adapter-smoke.mjs`: assert prompt packets mention feedback/hint tools.
- Modify `package.json`: include `memory-feedback-smoke.mjs` in `npm run test:memory`.
- Modify `docs/memory-v0.3.md` and `README.zh-CN.md`: document V0.3.1 feedback loop at a high level after implementation passes.

## Task 1: Store Shape and Review Diff

**Files:**
- Modify: `costar-core/memory/memory-store.mjs`
- Modify: `costar-core/memory/schemas/memory-store.schema.json`
- Modify: `costar-core/memory/memory-commit.mjs`
- Test: `costar-core/memory/memory-commit-smoke.mjs`

- [ ] **Step 1: Write the failing review diff assertion**

Add to `memory-commit-smoke.mjs` after loading the store:

```js
assert.equal(store.review_diffs.length, 1);
assert.equal(store.review_diffs[0].accepted_count, 2);
assert.equal(store.review_diffs[0].rejected_or_deferred_count, 2);
assert.equal(store.review_diffs[0].field_diffs.some((item) => item.field === "fact.value"), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node costar-core/memory/memory-commit-smoke.mjs`

Expected: FAIL because `review_diffs` is missing.

- [ ] **Step 3: Add store arrays**

Update `createEmptyMemoryStore()` and `normalizeMemoryStore()` so these arrays always exist:

```js
feedback_events: [],
review_diffs: [],
reflection_candidates: [],
hints: []
```

- [ ] **Step 4: Add review diff creation**

In `commitMemoryReviewDecisions()`, append one review diff when there are decisions:

```js
review_diffs: [
  ...normalizeArray(store.review_diffs),
  buildReviewDiff({ candidates, decisions, processedAt, operator: payload.operator })
]
```

`buildReviewDiff()` should include `review_diff_id`, `created_at`, `operator`, `candidate_count`, `accepted_count`, `edited_count`, `rejected_or_deferred_count`, `source_ids`, and `field_diffs`.

- [ ] **Step 5: Run test to verify it passes**

Run: `node costar-core/memory/memory-commit-smoke.mjs`

Expected: PASS.

## Task 2: Feedback Event Recording

**Files:**
- Create: `costar-core/memory/memory-feedback.mjs`
- Create: `costar-core/memory/memory-feedback-smoke.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing feedback smoke test**

Create `memory-feedback-smoke.mjs` with this first behavior:

```js
const result = recordMemoryFeedback({
  memory_store_path: memoryStorePath,
  target_type: "fact",
  target_id: "fact_riley_risk",
  feedback_type: "wrong",
  user_note: "Riley is not worried about price; she is worried about launch rollback.",
  proposed_reflection: {
    error_type: "over_inference",
    wrong_assumption: "Budget pressure means price sensitivity.",
    better_rule: "Distinguish price sensitivity from delivery or launch-risk pressure.",
    scope: "field_type:concern"
  },
  operator: "smoke-test"
});

assert.equal(result.status, "success");
assert.equal(result.memory_store_delta.feedback_events_added, 1);
assert.equal(result.memory_store_delta.reflection_candidates_added, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node costar-core/memory/memory-feedback-smoke.mjs`

Expected: FAIL because `memory-feedback.mjs` does not exist.

- [ ] **Step 3: Implement `recordMemoryFeedback()`**

The function loads the store, writes a feedback event, increments `fact.quality.user_marked_wrong_count` for `wrong` or `stale`, increments `user_marked_useful_count` for `useful`, and creates a pending reflection candidate when `proposed_reflection` is present.

- [ ] **Step 4: Run test to verify it passes**

Run: `node costar-core/memory/memory-feedback-smoke.mjs`

Expected: PASS for first behavior.

## Task 3: Reflection Review and Hint Retrieval

**Files:**
- Modify: `costar-core/memory/memory-feedback.mjs`
- Modify: `costar-core/memory/memory-feedback-smoke.mjs`

- [ ] **Step 1: Write failing reflection confirmation test**

Extend `memory-feedback-smoke.mjs`:

```js
const cards = buildMemoryReflectionCards({ reflection_candidates: store.reflection_candidates });
assert.equal(cards.status, "needs_user_review");
assert.equal(cards.prompt_cards[0].review_type, "memory_reflection");

const commit = commitMemoryReflectionDecisions({
  memory_store_path: memoryStorePath,
  review_decisions: [{
    reflection_id: store.reflection_candidates[0].reflection_id,
    decision: "accepted",
    notes: "This is the right correction pattern."
  }],
  operator: "smoke-test"
});

assert.equal(commit.status, "success");
assert.equal(commit.memory_store_delta.hints_added, 1);

const hints = getMemoryHints({
  memory_store_path: memoryStorePath,
  scope: "field_type:concern",
  limit: 5
});
assert.equal(hints.hints.length, 1);
assert.equal(hints.hints[0].hint_text.includes("Distinguish price sensitivity"), true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node costar-core/memory/memory-feedback-smoke.mjs`

Expected: FAIL because reflection helpers are missing.

- [ ] **Step 3: Implement reflection helpers**

Implement `buildMemoryReflectionCards()`, `commitMemoryReflectionDecisions()`, and `getMemoryHints()` in `memory-feedback.mjs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node costar-core/memory/memory-feedback-smoke.mjs`

Expected: PASS.

## Task 4: Host Tool Integration

**Files:**
- Modify: `costar-core/tools/host-model-dispatcher.mjs`
- Modify: `costar-core/tools/tool-contract.mjs`
- Modify: `costar-core/host-model-adapter/host-adapter-smoke.mjs`

- [ ] **Step 1: Write failing host dispatcher assertions**

Extend an existing host smoke or add assertions that:

```js
runHostModelTool({
  tool_name: "memory_feedback_record",
  tool_input: { memory_store_path: memoryStorePath, target_type: "fact", target_id: "fact_1", feedback_type: "useful" }
});
```

returns `status: "success"`, and `listHostModelTools()` includes the four new tools.

- [ ] **Step 2: Run host smoke to verify it fails**

Run: `npm run test:host-model`

Expected: FAIL because the tool contracts are not defined.

- [ ] **Step 3: Wire dispatcher and contracts**

Add switch cases for:

```js
memory_feedback_record
memory_reflection_prepare_cards
memory_reflection_commit
memory_hints_get
```

- [ ] **Step 4: Run host smoke to verify it passes**

Run: `npm run test:host-model`

Expected: PASS.

## Task 5: Memory Test Script and Docs

**Files:**
- Modify: `package.json`
- Modify: `docs/memory-v0.3.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Add memory feedback smoke to test script**

Update `npm run test:memory` to include:

```bash
node costar-core/memory/memory-feedback-smoke.mjs
```

- [ ] **Step 2: Run full memory tests**

Run: `npm run test:memory`

Expected: PASS.

- [ ] **Step 3: Document V0.3.1 behavior**

Document that V0.3.1 adds feedback events, review diffs, reflection candidates, and confirmed extraction hints without training model parameters or creating a second data world.

- [ ] **Step 4: Run final checks**

Run:

```bash
npm run test:memory
npm run test:host-model
npm test
```

Expected: all PASS.

## Self-Review

- Spec coverage: covers review diff, feedback record, reflection confirmation, hint retrieval, host tools, tests, and docs.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step remains.
- Type consistency: uses `memory_store_path`, `feedback_events`, `review_diffs`, `reflection_candidates`, and `hints` consistently across store, tools, and tests.
