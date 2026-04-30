// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  commitMemoryReflectionDecisions,
  buildMemoryReflectionCards,
  getMemoryFeedbackReport,
  getMemoryHints,
  recordMemoryFeedback
} from "./memory-feedback.mjs";
import { createEmptyMemoryStore, loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";
import { runHostModelTool } from "../tools/host-model-dispatcher.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-feedback-"));

try {
  const memoryStorePath = path.join(tmp, "memory-store.json");
  writeMemoryStore({
    storePath: memoryStorePath,
    store: {
      ...createEmptyMemoryStore(),
      sources: [{
        source_id: "src_001",
        source_type: "meeting_note",
        source_title: "Mock launch review",
        ingested_at: "2026-04-30T00:00:00.000Z",
        privacy_level: "normal",
        retention_policy: "metadata_only"
      }],
      entities: [{
        entity_id: "person_riley_chen",
        entity_type: "person",
        canonical_name: "Riley Chen",
        aliases: [],
        key_attributes: {},
        first_seen_at: "2026-04-30T00:00:00.000Z",
        last_updated_at: "2026-04-30T00:00:00.000Z",
        status: "active",
        merged_into: null
      }],
      facts: [{
        fact_id: "fact_riley_risk",
        entity_id: "person_riley_chen",
        fact_type: "concern",
        value: "Riley is worried about price.",
        confidence: "inferred",
        source_id: "src_001",
        source_excerpt: "Riley said the budget is tight.",
        date_observed: "2026-04-30",
        date_committed: "2026-04-30T00:00:00.000Z",
        status: "active",
        superseded_by: null,
        review: {
          reviewed_by: "smoke-test",
          reviewed_at: "2026-04-30T00:00:00.000Z",
          decision: "accepted",
          notes: ""
        },
        quality: {
          retrieval_count: 0,
          last_retrieved_at: null,
          user_marked_useful_count: 0,
          user_marked_wrong_count: 0
        }
      }],
      review_diffs: [{
        review_diff_id: "review_diff_001",
        created_at: "2026-04-30T00:00:00.000Z",
        operator: "smoke-test",
        candidate_count: 2,
        accepted_count: 1,
        edited_count: 1,
        rejected_or_deferred_count: 0,
        source_ids: ["src_001"],
        field_diffs: [{
          candidate_id: "cand_fact_risk",
          field: "fact.value",
          action: "edit",
          proposed_value: "Riley is worried about price.",
          committed_value: "Riley is worried about launch rollback."
        }]
      }]
    }
  });

  const feedback = recordMemoryFeedback({
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

  assert.equal(feedback.status, "success");
  assert.equal(feedback.memory_store_delta.feedback_events_added, 1);
  assert.equal(feedback.memory_store_delta.reflection_candidates_added, 1);

  let store = loadMemoryStore({ storePath: memoryStorePath });
  assert.equal(store.feedback_events.length, 1);
  assert.equal(store.facts[0].quality.user_marked_wrong_count, 1);
  assert.equal(store.reflection_candidates[0].review_status, "pending");

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
  assert.equal(hints.status, "success");
  assert.equal(hints.hints.length, 1);
  assert.equal(hints.hints[0].hint_text.includes("Distinguish price sensitivity"), true);

  store = loadMemoryStore({ storePath: memoryStorePath });
  assert.equal(store.reflection_candidates[0].review_status, "accepted");
  assert.equal(store.hints[0].status, "active");

  const hostUsefulFeedback = runHostModelTool({
    tool_name: "memory_feedback_record",
    tool_input: {
      memory_store_path: memoryStorePath,
      target_type: "fact",
      target_id: "fact_riley_risk",
      feedback_type: "useful",
      user_note: "The corrected launch-risk hint was useful.",
      operator: "smoke-test"
    }
  });
  assert.equal(hostUsefulFeedback.status, "success");

  const hostCards = runHostModelTool({
    tool_name: "memory_reflection_prepare_cards",
    tool_input: {
      reflection_candidates: store.reflection_candidates
    }
  });
  assert.equal(hostCards.source_type, "memory_reflection");

  const hostHints = runHostModelTool({
    tool_name: "memory_hints_get",
    tool_input: {
      memory_store_path: memoryStorePath,
      scope: "field_type:concern"
    }
  });
  assert.equal(hostHints.hint_count, 1);

  const report = getMemoryFeedbackReport({ memory_store_path: memoryStorePath });
  assert.equal(report.status, "success");
  assert.equal(report.feedback_type_counts.wrong, 1);
  assert.equal(report.review_diff_summary.total_review_diffs, 1);
  assert.equal(report.review_diff_summary.field_actions["fact.value"].edit, 1);

  const hostReport = runHostModelTool({
    tool_name: "memory_feedback_report",
    tool_input: {
      memory_store_path: memoryStorePath
    }
  });
  assert.equal(hostReport.feedback_type_counts.useful, 1);

  console.log("memory-feedback-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
