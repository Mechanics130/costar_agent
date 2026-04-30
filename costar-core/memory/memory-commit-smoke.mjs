// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCoStarCommit } from "../commit/costar-commit.mjs";
import { runHostModelTool } from "../tools/host-model-dispatcher.mjs";
import { createEmptyMemoryStore, loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";
import { buildMemoryReviewCards, translateMemoryReviewAnswers } from "./memory-review.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-commit-"));

try {
  const memoryStorePath = path.join(tmp, "memory-store.json");
  const commitLogPath = path.join(tmp, "costar-commit-log.json");
  writeMemoryStore({ storePath: memoryStorePath, store: createEmptyMemoryStore() });

  const sourceRefs = [{
    source_id: "src_001",
    source_type: "meeting_note",
    source_title: "Mock launch review",
    ingested_at: "2026-04-30T00:00:00.000Z",
    privacy_level: "normal",
    retention_policy: "metadata_only"
  }];

  const candidates = [
    {
      candidate_id: "cand_entity_riley",
      candidate_type: "entity",
      suggested_action: "update_existing",
      target_entity_hint: {
        name: "Riley Chen",
        person_ref: "person_riley_chen",
        resolution_action: "update"
      },
      proposed_value: {
        entity_type: "person",
        canonical_name: "Riley Chen",
        aliases: [],
        status: "active"
      },
      confidence: "inferred",
      source_id: "src_001",
      source_excerpt: "Riley asked for rollback plan twice.",
      review_status: "pending"
    },
    {
      candidate_id: "cand_fact_risk",
      candidate_type: "fact",
      suggested_action: "create_new",
      target_entity_hint: {
        name: "Riley Chen",
        person_ref: "person_riley_chen",
        resolution_action: "update"
      },
      proposed_value: {
        fact_type: "concern",
        value: "Riley cares about launch rollback risk."
      },
      confidence: "confirmed",
      source_id: "src_001",
      source_excerpt: "Riley asked for rollback plan twice.",
      review_status: "pending"
    },
    {
      candidate_id: "cand_fact_noise",
      candidate_type: "fact",
      suggested_action: "create_new",
      target_entity_hint: {
        name: "Riley Chen",
        person_ref: "person_riley_chen"
      },
      proposed_value: {
        fact_type: "preference",
        value: "Riley wants a long deck."
      },
      confidence: "inferred",
      source_id: "src_001",
      source_excerpt: "This was only a weak side remark.",
      review_status: "pending"
    },
    {
      candidate_id: "cand_fact_speculative",
      candidate_type: "fact",
      suggested_action: "create_new",
      target_entity_hint: {
        name: "Riley Chen",
        person_ref: "person_riley_chen"
      },
      proposed_value: {
        fact_type: "need",
        value: "Riley may need political cover before approving launch."
      },
      confidence: "speculative",
      source_id: "src_001",
      source_excerpt: "Riley sounded cautious.",
      review_status: "pending"
    }
  ];

  const cards = buildMemoryReviewCards({ candidates, source_refs: sourceRefs, limit: 10 });
  assert.equal(cards.source_type, "memory_review");
  assert.equal(cards.pending_count, 4);
  assert.equal(cards.prompt_cards[0].response_schema.final_action.includes("accept"), true);

  const dispatcherCards = runHostModelTool({
    tool_name: "memory_review_prepare_cards",
    tool_input: { candidates, source_refs: sourceRefs }
  });
  assert.equal(dispatcherCards.source_type, "memory_review");

  const reviewDecisions = translateMemoryReviewAnswers({
    answers: [
      { candidate_id: "cand_entity_riley", final_action: "accept" },
      { candidate_id: "cand_fact_risk", final_action: "accept" },
      { candidate_id: "cand_fact_noise", final_action: "reject", notes: "Not enough evidence." },
      { candidate_id: "cand_fact_speculative", final_action: "defer", notes: "Ask user later." }
    ]
  });
  assert.equal(reviewDecisions.length, 4);
  assert.equal(reviewDecisions[0].decision, "accepted");
  assert.equal(reviewDecisions[2].decision, "rejected");
  assert.equal(reviewDecisions[3].decision, "deferred");

  const translated = runHostModelTool({
    tool_name: "memory_review_translate_answers",
    tool_input: {
      memory_store_path: memoryStorePath,
      source_refs: sourceRefs,
      candidates,
      answers: [
        { candidate_id: "cand_fact_risk", final_action: "accept" }
      ],
      operator: "smoke-test"
    }
  });
  assert.equal(translated.target, "memory_review");
  assert.equal(translated.commit_request.review_decisions[0].decision, "accepted");

  const commitResult = runCoStarCommit({
    target: "memory_review",
    commit_id: "memory-review-smoke-001",
    commit_log_path: commitLogPath,
    commit_request: {
      memory_store_path: memoryStorePath,
      source_refs: sourceRefs,
      candidates,
      review_decisions: reviewDecisions,
      operator: "smoke-test"
    }
  });

  assert.equal(commitResult.status, "success");
  assert.equal(commitResult.memory_store_delta.facts_added, 1);
  assert.equal(commitResult.memory_store_delta.candidates_rejected_or_deferred, 2);
  assert.equal(commitResult.committed_records.facts, 1);
  assert.equal(commitResult.commit_log.written, true);

  const replay = runCoStarCommit({
    target: "memory_review",
    commit_id: "memory-review-smoke-001",
    commit_log_path: commitLogPath,
    commit_request: {
      memory_store_path: memoryStorePath,
      source_refs: sourceRefs,
      candidates,
      review_decisions: reviewDecisions,
      operator: "smoke-test"
    }
  });
  assert.equal(replay.is_replay, true);

  const store = loadMemoryStore({ storePath: memoryStorePath });
  assert.equal(store.sources.length, 1);
  assert.equal(store.entities.length, 1);
  assert.equal(store.facts.length, 1);
  assert.equal(store.facts[0].source_id, "src_001");
  assert.equal(store.facts[0].source_excerpt, "Riley asked for rollback plan twice.");
  assert.equal(Boolean(store.facts[0].review.reviewed_at), true);
  assert.equal(store.facts.some((fact) => fact.value.includes("political cover")), false);
  assert.equal(store.candidates.find((item) => item.candidate_id === "cand_fact_noise")?.review_status, "rejected");
  assert.equal(store.candidates.find((item) => item.candidate_id === "cand_fact_speculative")?.review_status, "pending");
  assert.equal(store.review_diffs.length, 1);
  assert.equal(store.review_diffs[0].accepted_count, 2);
  assert.equal(store.review_diffs[0].rejected_or_deferred_count, 2);
  assert.equal(store.review_diffs[0].field_diffs.some((item) => item.field === "fact.value"), true);

  console.log("memory-commit-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
