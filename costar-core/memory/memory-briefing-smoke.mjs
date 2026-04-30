// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHostModelBriefingWorkflow } from "../host-model-workflows/briefing-workflow.mjs";
import { createEmptyMemoryStore, loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";
import { recordBriefingArtifact, searchFactsForBriefing } from "./memory-retrieval.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-briefing-"));

try {
  const memoryStorePath = path.join(tmp, "memory-store.json");
  const store = createEmptyMemoryStore();
  store.sources.push({
    source_id: "src_launch_review",
    source_type: "meeting_note",
    source_title: "Mock launch review",
    source_date: "2026-04-30",
    ingested_at: "2026-04-30T00:00:00.000Z",
    privacy_level: "normal",
    retention_policy: "metadata_only"
  });
  store.entities.push({
    entity_id: "ent_riley",
    entity_type: "person",
    canonical_name: "Riley Chen",
    aliases: ["Riley"],
    key_attributes: {},
    first_seen_at: "2026-04-30T00:00:00.000Z",
    last_updated_at: "2026-04-30T00:00:00.000Z",
    status: "active",
    merged_into: null
  });
  store.facts.push({
    fact_id: "fact_risk",
    entity_id: "ent_riley",
    fact_type: "concern",
    value: "Riley cares about launch rollback risk.",
    confidence: "confirmed",
    source_id: "src_launch_review",
    source_excerpt: "Riley asked for rollback plan twice.",
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
      user_marked_useful_count: 1,
      user_marked_wrong_count: 0
    }
  });
  writeMemoryStore({ storePath: memoryStorePath, store });

  const hits = searchFactsForBriefing({
    storePath: memoryStorePath,
    personName: "Riley Chen",
    conversationGoal: "Prepare launch review and rollback plan.",
    limit: 3
  });
  assert.equal(hits.target_entity.entity_id, "ent_riley");
  assert.equal(hits.facts_included.length, 1);
  assert.equal(hits.facts_included[0].fact_id, "fact_risk");
  assert.equal(hits.facts_included[0].source_excerpt, "Riley asked for rollback plan twice.");

  const artifactResult = recordBriefingArtifact({
    storePath: memoryStorePath,
    targetEntities: ["ent_riley"],
    factsIncluded: hits.facts_included,
    artifactPath: path.join(tmp, "mock-briefing.md")
  });
  assert.equal(artifactResult.artifact.artifact_type, "briefing");
  assert.deepEqual(artifactResult.artifact.facts_included, ["fact_risk"]);

  const afterArtifact = loadMemoryStore({ storePath: memoryStorePath });
  assert.equal(afterArtifact.artifacts.length, 1);
  assert.equal(afterArtifact.facts.find((fact) => fact.fact_id === "fact_risk")?.quality.retrieval_count, 1);

  const workflowResponse = await runHostModelBriefingWorkflow({
    memory_store_path: memoryStorePath,
    target_profile: {
      person_name: "Riley Chen",
      person_ref: "ent_riley",
      compiled_truth: {
        summary: "Riley is cautious about launch risk.",
        relationship_stage: "active stakeholder",
        intent: "Reduce launch risk before approving.",
        attitude: {
          label: "cautious",
          reason: "Needs rollback clarity."
        }
      },
      timeline: []
    },
    conversation_goal: "Prepare launch review and rollback plan.",
    conversation_topic: "Launch readiness",
    host_model: {
      provider: "codex-host",
      model: "codex-host",
      target: "codex"
    },
    host_reasoning_output: {
      briefing: {
        quick_brief: "Lead with rollback readiness.",
        relationship_read: {
          current_state: "Active launch stakeholder",
          likely_intent: "Validate that rollback risk is under control",
          attitude: "Cautious but pragmatic",
          trust_level: "medium"
        },
        approach_strategy: {
          goal_translation: "Show Riley the rollback plan and ask what risk remains.",
          recommended_opening: "Start from the rollback concern.",
          recommended_style: "Concrete and evidence-led",
          why_now: "Launch readiness is being decided now."
        },
        talking_points: ["Rollback trigger and owner"],
        watchouts: ["Do not overstate confidence"],
        questions_to_ask: ["What rollback risk still blocks approval?"],
        next_actions: ["Send Riley the final rollback checklist"]
      }
    },
    options: {
      save_run_artifacts: false,
      write_briefing_file: false
    }
  });

  assert.equal(workflowResponse.memory_evidence.evidence_trace_available, true);
  assert.equal(workflowResponse.memory_evidence.facts_included[0].fact_id, "fact_risk");

  const afterWorkflow = loadMemoryStore({ storePath: memoryStorePath });
  assert.equal(afterWorkflow.artifacts.length, 2);
  assert.equal(afterWorkflow.facts.find((fact) => fact.fact_id === "fact_risk")?.quality.retrieval_count, 2);

  console.log("memory-briefing-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
