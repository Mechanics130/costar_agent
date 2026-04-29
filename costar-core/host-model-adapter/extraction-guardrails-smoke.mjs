// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHostReviewPrompt } from "./review-protocol.mjs";
import { runHostModelTool } from "../tools/host-model-dispatcher.mjs";
import { runHostModelCaptureWorkflow } from "../host-model-workflows/capture-workflow.mjs";

const tempRoot = path.join(os.tmpdir(), "costar-extraction-guardrails-smoke");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const profileStorePath = path.join(tempRoot, "relationship-profile-store.json");
const richSourceContent = [
  "Meeting note: Riley Park is the finance-side partner for the weather bonus launch.",
  "Speaker dimension: Riley repeatedly said the rollout can continue only if the ROI guardrail is explicit.",
  "Role profile: Riley owns budget risk and needs a clean escalation path before approving expansion.",
  "Attitude: cautiously supportive, not blocking the plan, but worried about uncontrolled subsidy spend.",
  "Intent: keep the pilot moving while forcing a smaller scope, clearer owner, and stronger rollback plan.",
  "Key issue: consensus exists on a small city pilot; non-consensus remains on automated budget expansion.",
  "Key quote: 'Do not call it approved until finance can see the stop-loss trigger.'",
  "My hidden need: I need Riley to confirm the BRD language without forcing a premature ROI promise.",
  "Counterpart hidden need: Riley needs visible risk boundaries and proof that operations will not over-scale.",
  "Next action: send Riley the BRD guardrail section and ask which stop-loss trigger is acceptable."
].join("\n").repeat(3);

const sparseCaptureResult = await runHostModelCaptureWorkflow({
  request_id: "extraction-guardrails-smoke-001",
  goal: "Import meeting notes and create relationship profiles.",
  target_people: ["Riley Park"],
  sources: [
    {
      source_id: "meeting-guardrail-001",
      source_title: "Guardrail extraction meeting",
      captured_at: "2026-04-29",
      content: richSourceContent
    }
  ],
  host_model: {
    provider: "host",
    model: "test-host-model",
    target: "claude"
  },
  host_reasoning_output: {
    skill: "relationship-ingestion",
    version: "0.1.0",
    status: "success",
    source: "host_model",
    person_profiles: [
      {
        person_name: "Riley Park",
        person_ref: "Riley Park",
        resolution_action: "create",
        profile_tier: "stub",
        confidence: "medium",
        compiled_truth: {
          summary: "Riley Park appeared in the meeting.",
          current_judgment: "Riley Park appeared in the meeting.",
          relationship_stage: "TBD",
          intent: "TBD",
          attitude: {
            label: "TBD",
            reason: ""
          },
          latent_needs: {
            counterpart: [],
            self: []
          },
          key_issues: [],
          attitude_intent: {
            counterpart: {
              attitude: "TBD",
              intent: "TBD",
              evidence: [],
              confidence: "low"
            },
            self: {
              attitude: "TBD",
              intent: "TBD",
              evidence: [],
              confidence: "low"
            }
          },
          traits: [],
          tags: [],
          preferences: [],
          boundaries: [],
          risk_flags: [],
          open_questions: [],
          next_actions: []
        },
        timeline: [
          {
            date: "pending",
            source_id: "unknown-source",
            source_title: "未命名资料",
            event_summary: "待补充",
            matched_excerpt_index: 1
          }
        ],
        evidence_summary: {
          excerpt_count: 0,
          source_count: 0,
          key_evidence: []
        }
      }
    ],
    resolved_people: [
      {
        person_name: "Riley Park",
        resolution_action: "create",
        confidence: "medium"
      }
    ],
    review_bundle: {
      pending_count: 1,
      candidates: [
        {
          person_name: "Riley Park",
          suggested_action: "create",
          priority: "high",
          needs_confirmation: true,
          questions: ["Should Riley Park be created as a relationship profile?"],
          fields_to_confirm: [],
          evidence_preview: [
            "Riley asked not to call the launch approved until finance can see the stop-loss trigger."
          ]
        }
      ]
    }
  }
});

const warnings = sparseCaptureResult.ingestion_result.extraction_warnings;
assert.ok(Array.isArray(warnings), "capture should attach extraction_warnings to ingestion_result");
assert.ok(warnings.length > 0, "rich source plus sparse profile should produce extraction warnings");

const rileyWarning = warnings.find((warning) => warning.person_name === "Riley Park");
assert.ok(rileyWarning, "warning should be person-scoped");
assert.equal(rileyWarning.warning_type, "possible_underextraction");
assert.ok(rileyWarning.missing_fields.includes("compiled_truth.traits"));
assert.ok(rileyWarning.missing_fields.includes("compiled_truth.latent_needs"));
assert.ok(rileyWarning.missing_fields.includes("compiled_truth.key_issues"));
assert.ok(rileyWarning.missing_fields.includes("compiled_truth.attitude_intent"));
assert.ok(rileyWarning.missing_fields.includes("timeline.source"));

assert.deepEqual(sparseCaptureResult.processing_feedback.extraction_warnings, warnings);
assert.deepEqual(sparseCaptureResult.user_feedback.extraction_warnings, warnings);

const reviewPrompt = buildHostReviewPrompt(sparseCaptureResult, { limit: 1 });
assert.deepEqual(reviewPrompt.prompt_cards[0].extraction_warnings, [rileyWarning]);
assert.deepEqual(reviewPrompt.candidates_preview[0].extraction_warnings, [rileyWarning]);

const translated = await runHostModelTool({
  tool_name: "review_translate_answers",
  tool_input: {
    source_type: "profile_review",
    commit_id: "extraction-guardrails-smoke-commit",
    ingestion_result: sparseCaptureResult.ingestion_result,
    answers: [
      {
        person_name: "Riley Park",
        final_action: "create",
        resolved_person_ref: "person_riley_park",
        resolved_person_name: "Riley Park",
        profile_tier: "active"
      }
    ],
    profile_store_path: profileStorePath,
    options: {
      write_store: true
    }
  }
});

const commitResult = await runHostModelTool({
  tool_name: "review_commit_decisions",
  tool_input: translated
});

assert.equal(commitResult.status, "success");
const committedProfile = commitResult.committed_profiles[0];
assert.equal(committedProfile.timeline[0].source_id, "meeting-guardrail-001");
assert.equal(committedProfile.timeline[0].source_title, "Guardrail extraction meeting");
assert.notEqual(committedProfile.timeline[0].event_summary, "待补充");
assert.notEqual(committedProfile.timeline[0].event_summary, "Imported relationship event");

console.log("CoStar extraction guardrails smoke passed.");
