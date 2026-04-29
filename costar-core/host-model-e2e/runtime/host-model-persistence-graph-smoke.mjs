// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runHostModelTool } from "../../tools/host-model-dispatcher.mjs";

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const tempRoot = path.join(os.tmpdir(), "costar-host-model-persistence-graph-smoke");
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

const profileStorePath = path.join(tempRoot, "relationship-profile-store.json");
const graphReviewStorePath = path.join(tempRoot, "relationship-graph-review-store.json");

const captureResult = await runHostModelTool({
  tool_name: "capture_ingest_sources",
  tool_input: {
    goal: "Capture a no-file communication note into a durable relationship profile.",
    sources: [
      {
        source_id: "chat-2026-04-25-01",
        source_type: "direct_note",
        title: "Direct communication note",
        captured_at: "2026-04-25",
        content: "Alex Rivera wants a low-risk pilot and asked for clear ownership before committing."
      }
    ],
    host_reasoning_output: {
      status: "success",
      resolved_people: [
        {
          person_name: "Alex Rivera",
          resolution_action: "create",
          confidence: "high"
        }
      ],
      review_bundle: {
        candidates: [
          {
            person_name: "Alex Rivera",
            suggested_action: "create",
            priority: "high",
            needs_confirmation: true,
            fields_to_confirm: [
              {
                field: "compiled_truth.summary",
                current_value: "Execution partner who wants a low-risk pilot before committing."
              },
              {
                field: "compiled_truth.latent_needs",
                current_value: {
                  counterpart: [
                    {
                      need: "Reduce commitment risk before joining the pilot.",
                      evidence: ["asked for clear ownership before committing"],
                      confidence: "high"
                    }
                  ],
                  self: [
                    {
                      need: "Understand the minimum conditions for Alex to move forward.",
                      evidence: ["asked for clear ownership before committing"],
                      confidence: "medium"
                    }
                  ]
                }
              },
              {
                field: "compiled_truth.key_issues",
                current_value: [
                  {
                    issue: "Pilot ownership and risk boundary",
                    consensus: ["Start with a low-risk pilot"],
                    non_consensus: ["Ownership still needs to be clarified"],
                    key_quotes: ["clear ownership before committing"],
                    confidence: "high"
                  }
                ]
              },
              {
                field: "compiled_truth.attitude_intent",
                current_value: {
                  counterpart: {
                    attitude: "interested but cautious",
                    intent: "test whether ownership is clear enough",
                    evidence: ["asked for clear ownership before committing"],
                    confidence: "high"
                  },
                  self: {
                    attitude: "seeking alignment",
                    intent: "confirm next-step conditions",
                    evidence: ["wants to capture a no-file communication note"],
                    confidence: "medium"
                  }
                }
              }
            ],
            evidence_preview: ["Alex Rivera wants a low-risk pilot and asked for clear ownership before committing."]
          }
        ]
      }
    },
    options: {
      auto_context_from_store: false
    }
  }
});

record(captureResult.user_feedback?.insight_preview?.length === 1, "capture feedback includes insight preview", "");

const reviewCards = await runHostModelTool({
  tool_name: "review_prepare_cards",
  tool_input: {
    ingestion_result: captureResult.ingestion_result
  }
});

record(Boolean(reviewCards.profile_tier_glossary?.stub), "review cards explain profile tiers", "");
record(
  reviewCards.prompt_cards?.[0]?.insight_preview?.latent_needs?.counterpart?.length === 1,
  "review cards preserve rich insight preview",
  ""
);

const translatedProfileReview = await runHostModelTool({
  tool_name: "review_translate_answers",
  tool_input: {
    source_type: "profile_review",
    commit_id: "host-model-rich-profile-commit-001",
    ingestion_result: captureResult.ingestion_result,
    answers: [
      {
        person_name: "Alex Rivera",
        final_action: "create",
        resolved_person_ref: "person_alex_rivera",
        resolved_person_name: "Alex Rivera",
        profile_tier: "active"
      }
    ],
    profile_store_path: profileStorePath,
    options: {
      write_store: true
    }
  }
});

const profileCommit = await runHostModelTool({
  tool_name: "review_commit_decisions",
  tool_input: translatedProfileReview
});

record(profileCommit.status === "success", "rich profile review commit succeeds", "");

const profileRead = await runHostModelTool({
  tool_name: "profile_get",
  tool_input: {
    person_name: "Alex Rivera",
    profile_store_path: profileStorePath,
    options: {
      save_run_artifacts: false
    }
  }
});

const profile = profileRead.profile_read;
record(profile?.insight_board?.latent_needs?.counterpart?.length === 1, "latent needs persist to profile store", "");
record(profile?.insight_board?.key_issues?.length === 1, "key issues persist to profile store", "");
record(
  profile?.insight_board?.attitude_intent?.counterpart?.attitude === "interested but cautious",
  "attitude intent persists to profile store",
  ""
);
record(profile?.timeline_digest?.[0]?.source_id === "chat-2026-04-25-01", "timeline keeps source id", "");
record(profile?.timeline_digest?.[0]?.source_title === "Direct communication note", "timeline keeps source title", "");

const translatedGraphReview = await runHostModelTool({
  tool_name: "review_translate_answers",
  tool_input: {
    source_type: "graph_review",
    commit_id: "host-model-self-graph-commit-001",
    graph_result: {
      skill: "relationship-graph",
      review_bundle: { edge_candidates: [] }
    },
    answers: [
      {
        source_person_ref: "person_self",
        source_person_name: "Me",
        target_person_ref: "person_alex_rivera",
        target_person_name: "Alex Rivera",
        final_action: "confirm",
        corrected_relation_type: "my_counterpart",
        relation_score: 90,
        note: "Alex is directly connected to the user in this relationship network."
      }
    ],
    graph_review_store_path: graphReviewStorePath
  }
});

const graphCommit = await runHostModelTool({
  tool_name: "review_commit_decisions",
  tool_input: translatedGraphReview
});

record(graphCommit.confirmed_edges?.length === 1, "answer-only graph review edge is committed", "");

const selfGraph = await runHostModelTool({
  tool_name: "graph_get_person",
  tool_input: {
    person_ref: "person_self",
    profile_store_path: profileStorePath,
    graph_review_store_path: graphReviewStorePath,
    options: {
      save_run_artifacts: false
    }
  }
});

record(selfGraph.status === "success", "graph_get_person resolves self node", "");
record(selfGraph.graph?.nodes?.some((node) => node.person_ref === "person_self"), "self node appears in graph", "");
record(selfGraph.graph?.edges?.length === 1, "confirmed review edge appears in graph read side", "");

const pathResult = await runHostModelTool({
  tool_name: "graph_find_path",
  tool_input: {
    source_person_ref: "person_self",
    target_person_ref: "person_alex_rivera",
    profile_store_path: profileStorePath,
    graph_review_store_path: graphReviewStorePath,
    options: {
      save_run_artifacts: false
    }
  }
});

record(pathResult.connection_path?.length === 2, "graph_find_path uses confirmed self edge", "");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
