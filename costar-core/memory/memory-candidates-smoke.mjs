// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHostModelCaptureWorkflow } from "../host-model-workflows/capture-workflow.mjs";
import {
  buildMemoryCandidatesFromIngestion,
  normalizeCandidateConfidence
} from "./memory-candidates.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(readFileSync(path.join(__dirname, "samples", "memory-candidates.request.example.json"), "utf8"));

const result = buildMemoryCandidatesFromIngestion(sample);

assert.equal(result.source_refs.length, 1);
assert.equal(result.source_refs[0].source_id, "src_001");
assert.equal(result.candidates.some((item) => item.candidate_type === "entity"), true);
assert.equal(result.candidates.some((item) => item.candidate_type === "fact"), true);
assert.equal(result.candidates.every((item) => item.source_id && item.source_excerpt), true);
assert.equal(result.candidates.every((item) => item.review_status === "pending"), true);
assert.equal(normalizeCandidateConfidence("high"), "confirmed");
assert.equal(normalizeCandidateConfidence("medium"), "inferred");
assert.equal(normalizeCandidateConfidence("low"), "speculative");

const speculativeNeed = result.candidates.find((item) =>
  item.candidate_type === "fact"
  && item.proposed_value?.fact_type === "need"
  && item.proposed_value?.value?.includes("political cover")
);
assert.equal(speculativeNeed?.confidence, "speculative");
assert.equal(speculativeNeed?.suggested_action, "create_new");

const captureResponse = await runHostModelCaptureWorkflow({
  goal: "Turn this meeting note into memory candidates.",
  focus_people: ["Riley Chen"],
  sources: sample.source_manifest,
  host_reasoning_output: {
    status: "success",
    source_summary: {
      source_count: 1,
      excerpt_count: 1,
      dropped_excerpt_count: 0,
      target_people: ["Riley Chen"],
      focus_people: ["Riley Chen"]
    },
    resolved_people: [{
      person_name: "Riley Chen",
      resolution_action: "update",
      matched_existing_person_id: "person_riley_chen",
      matched_existing_person_name: "Riley Chen",
      reasoning: "Existing stakeholder with new launch risk evidence.",
      confidence: "medium"
    }],
    person_profiles: sample.person_profiles,
    review_bundle: {
      candidates: []
    }
  }
});

assert.equal(captureResponse.memory_candidates.length, result.candidates.length);
assert.equal(captureResponse.source_refs.length, 1);
assert.equal(Array.isArray(captureResponse.processing_feedback.memory_candidates), true);
assert.equal(captureResponse.user_feedback.memory_candidate_count, result.candidates.length);

console.log("memory-candidates-smoke passed");
