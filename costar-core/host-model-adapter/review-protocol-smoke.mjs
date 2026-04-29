// SPDX-License-Identifier: Apache-2.0
import { buildHostReviewPrompt, translateHostReviewAnswers } from "./review-protocol.mjs";

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const profilePrompt = buildHostReviewPrompt({
  skill: "relationship-capture",
  stage: "ingestion",
  confirmation_request: {
    pending_count: 1,
    top_candidates: [
      {
        person_name: "Bella Xu",
        suggested_action: "create",
        priority: "medium",
        needs_confirmation: true,
        questions: ["Should Bella Xu be created as a new relationship profile?"],
        evidence_preview: ["Bella Xu is willing to keep moving if examples and scheduling are ready."]
      }
    ]
  }
});

record(profilePrompt.source_type === "profile_review", "profile review prompt uses correct source type", "");
record(profilePrompt.prompt_cards.length === 1, "profile review prompt returns one card", "");
record(profilePrompt.prompt_cards[0].response_schema.final_action.includes("create"), "profile review prompt exposes create/update style actions", "");

const profileCommit = translateHostReviewAnswers({
  source_type: "profile_review",
  commit_id: "profile-review-smoke-001",
  ingestion_result: {
    skill: "relationship-ingestion",
    version: "0.1.0",
    resolved_people: [],
    review_bundle: { candidates: [] }
  },
  answers: [
    {
      person_name: "Bella Xu",
      final_action: "create",
      resolved_person_ref: "person_bella_xu",
      resolved_person_name: "Bella Xu",
      profile_tier: "active",
      notes: "Create a new profile."
    }
  ],
  profile_store_path: "tmp/relationship-profile-store.json",
  operator: "host-user"
});

record(profileCommit.target === "profile_review", "profile review answers translate to profile_review commit", "");
record(profileCommit.commit_id === "profile-review-smoke-001", "profile review commit_id preserved", "");
record(profileCommit.commit_request.review_decisions[0].final_action === "create", "profile review final action preserved", "");

const graphPrompt = buildHostReviewPrompt({
  skill: "relationship-graph",
  review_bundle: {
    edge_candidates: [
      {
        source_person_name: "Ava Chen",
        source_person_ref: "person_ava_chen",
        target_person_name: "Bella Xu",
        target_person_ref: "person_bella_xu",
        relation_type: "same_source_context",
        relation_score: 7,
        reason: "This edge mainly comes from shared source context and still needs stronger evidence.",
        suggested_action: "check_entity_alignment",
        review_priority: 6
      }
    ]
  }
});

record(graphPrompt.source_type === "graph_review", "graph review prompt uses correct source type", "");
record(graphPrompt.prompt_cards.length === 1, "graph review prompt returns one edge card", "");
record(graphPrompt.prompt_cards[0].response_schema.final_action.includes("reject"), "graph review prompt exposes graph review actions", "");

const graphCommit = translateHostReviewAnswers({
  source_type: "graph_review",
  commit_id: "graph-review-smoke-001",
  graph_result: {
    skill: "relationship-graph",
    review_bundle: { edge_candidates: [] }
  },
  answers: [
    {
      source_person_ref: "person_ava_chen",
      target_person_ref: "person_bella_xu",
      final_action: "reject",
      note: "This is only a co-occurrence edge for now."
    }
  ],
  graph_review_store_path: "tmp/relationship-graph-review-store.json",
  operator: "host-user"
});

record(graphCommit.target === "graph_review", "graph review answers translate to graph_review commit", "");
record(graphCommit.commit_id === "graph-review-smoke-001", "graph review commit_id preserved", "");
record(graphCommit.commit_request.review_decisions[0].final_action === "reject", "graph review final action preserved", "");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
