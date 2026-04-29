// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCoStarCommitInfo, listWritableCommitTargets } from "../../commit/costar-commit.mjs";
import { getHostModelToolContractV1, listHostModelTools } from "../../tools/tool-contract.mjs";
import { getHostModelDispatcherInfo, runHostModelTool } from "../../tools/host-model-dispatcher.mjs";

const failures = [];
const checks = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const contract = getHostModelToolContractV1();
const tools = listHostModelTools();
const dispatcher = getHostModelDispatcherInfo();
const commitInfo = getCoStarCommitInfo();
const writableTargets = listWritableCommitTargets();

record(contract.tools.length >= 10, "contract exposes expected tool count", `count=${contract.tools.length}`);
record(
  tools.some((tool) => tool.name === "review_commit_decisions"),
  "review_commit_decisions is exposed",
  ""
);
record(
  tools.some((tool) => tool.name === "capture_ingest_sources" && tool.requires_host_reasoning),
  "capture_ingest_sources marked as host reasoning",
  ""
);
record(
  tools.some((tool) => tool.name === "view_get" && tool.read_only),
  "view_get marked read-only",
  ""
);
record(
  writableTargets.some((item) => item.target === "profile_review"),
  "profile_review writable target exists",
  ""
);
record(
  writableTargets.some((item) => item.target === "graph_review"),
  "graph_review writable target exists",
  ""
);
record(
  dispatcher.supported_tools.length === tools.length,
  "dispatcher and contract tool counts match",
  `${dispatcher.supported_tools.length} vs ${tools.length}`
);

const emptyReview = runHostModelTool({ tool_name: "review_list_candidates", tool_input: {} });
record(emptyReview.pending_count === 0, "review_list_candidates handles empty input", JSON.stringify(emptyReview));

const feedbackPreview = runHostModelTool({
  tool_name: "capture_get_feedback",
  tool_input: {
    ingestion_result: {
      review_bundle: {
        candidates: [{ person_name: "Ava Chen", needs_confirmation: true }]
      },
      resolved_people: [
        { person_name: "Ava Chen", resolution_action: "create" },
        { person_name: "Jordan Li", resolution_action: "update" }
      ]
    }
  }
});

record(feedbackPreview.confirmation_request.required === true, "capture_get_feedback returns confirmation request", "");
record(feedbackPreview.processing_feedback.updated_people_count === 1, "capture_get_feedback counts updates", "");
record(commitInfo.writable_targets.length === 2, "commit layer exposes exactly two writable targets", "");

const captureResult = await runHostModelTool({
  tool_name: "capture_ingest_sources",
  tool_input: {
    goal: "Turn this meeting note into relationship candidates and capture feedback.",
    focus_people: ["Ava Chen"],
    sources: [
      {
        source_id: "meeting-2026-04-22-01",
        source_type: "markdown",
        title: "Brand collaboration sync",
        content: "Ava Chen wants a small pilot first and cares about ROI. Bella Xu is willing to keep moving if examples and scheduling are ready."
      }
    ],
    host_model: {
      provider: "anthropic-host",
      model: "claude-host",
      target: "claude"
    },
    host_reasoning_output: {
      status: "success",
      source_summary: {
        source_count: 1,
        excerpt_count: 1,
        dropped_excerpt_count: 0,
        target_people: ["Ava Chen", "Bella Xu"],
        focus_people: ["Ava Chen"]
      },
      detected_people: [
        {
          person_name: "Ava Chen",
          confidence: "high",
          matched_source_ids: ["meeting-2026-04-22-01"],
          evidence: ["Ava Chen wants a small pilot first and cares about ROI."]
        }
      ],
      resolved_people: [
        {
          person_name: "Ava Chen",
          resolution_action: "update",
          matched_existing_person_id: "person_ava_chen",
          matched_existing_person_name: "Ava Chen",
          reasoning: "Existing relationship with stronger preference and boundary evidence.",
          confidence: "high"
        },
        {
          person_name: "Bella Xu",
          resolution_action: "create",
          matched_existing_person_id: null,
          matched_existing_person_name: null,
          reasoning: "A new collaborator with an active follow-up path.",
          confidence: "medium"
        }
      ],
      review_bundle: {
        candidates: [
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
    },
    options: {
      auto_context_from_store: false
    }
  }
});

record(captureResult.status === "needs_review", "capture_ingest_sources materializes host reasoning", "");
record(captureResult.source === "host_model_adapter", "capture_ingest_sources marks host source", "");
record(captureResult.confirmation_request?.required === true, "capture_ingest_sources returns confirmation request", "");
record(captureResult.processing_feedback?.new_candidate_count === 1, "capture_ingest_sources preserves candidate counts", "");

const reviewCards = await runHostModelTool({
  tool_name: "review_prepare_cards",
  tool_input: {
    ingestion_result: captureResult.ingestion_result
  }
});

record(reviewCards.source_type === "profile_review", "review_prepare_cards derives profile review cards", "");
record(Array.isArray(reviewCards.prompt_cards) && reviewCards.prompt_cards.length === 1, "review_prepare_cards returns one profile card", "");

const tempRoot = path.join(os.tmpdir(), "costar-host-model-e2e");
rmSync(tempRoot, { recursive: true, force: true });
const profileStorePath = path.join(tempRoot, "relationship-profile-store.json");
const graphReviewStorePath = path.join(tempRoot, "relationship-graph-review-store.json");
const viewStorePath = path.join(tempRoot, "relationship-view-store.json");
const viewMarkdownDir = path.join(tempRoot, "views");
mkdirSync(viewMarkdownDir, { recursive: true });

const translatedProfileReview = await runHostModelTool({
  tool_name: "review_translate_answers",
  tool_input: {
    source_type: "profile_review",
    commit_id: "host-model-e2e-profile-commit-001",
    ingestion_result: captureResult.ingestion_result,
    answers: [
      {
        person_name: "Bella Xu",
        final_action: "create"
      }
    ],
    profile_store_path: profileStorePath,
    options: {
      write_store: true
    }
  }
});

record(translatedProfileReview.target === "profile_review", "review_translate_answers keeps profile review target", "");
record(translatedProfileReview.commit_id === "host-model-e2e-profile-commit-001", "review_translate_answers preserves commit_id", "");

const commitResult = await runHostModelTool({
  tool_name: "review_commit_decisions",
  tool_input: translatedProfileReview
});

record(commitResult.status === "success", "review_commit_decisions writes profile review into store", "");
record(commitResult.is_replay === false, "review_commit_decisions marks first write as non-replay", "");
record(commitResult.profile_store_delta?.written === true, "review_commit_decisions reports written profile store", "");

const replayCommitResult = await runHostModelTool({
  tool_name: "review_commit_decisions",
  tool_input: translatedProfileReview
});

record(replayCommitResult.is_replay === true, "review_commit_decisions replays commit_id safely", "");
record(replayCommitResult.commit_id === "host-model-e2e-profile-commit-001", "review replay preserves commit_id", "");

const profileResult = await runHostModelTool({
  tool_name: "profile_get",
  tool_input: {
    person_name: "Bella Xu",
    profile_store_path: profileStorePath,
    options: {
      save_run_artifacts: false
    }
  }
});

record(profileResult.status === "success", "profile_get reads committed profile from same store", "");

const refreshResult = await runHostModelTool({
  tool_name: "view_refresh",
  tool_input: {
    profile_store_path: profileStorePath,
    graph_review_store_path: graphReviewStorePath,
    view_store_path: viewStorePath,
    people: [
      {
        person_name: "Bella Xu"
      }
    ],
    options: {
      write_store: true,
      write_markdown: true,
      save_run_artifacts: false,
      markdown_dir: viewMarkdownDir
    }
  }
});

record(Array.isArray(refreshResult.refreshed_views) && refreshResult.refreshed_views.length === 1, "view_refresh updates a persistent person view", "");

const viewResult = await runHostModelTool({
  tool_name: "view_get",
  tool_input: {
    person_name: "Bella Xu",
    profile_store_path: profileStorePath,
    graph_review_store_path: graphReviewStorePath,
    view_store_path: viewStorePath,
    options: {
      save_run_artifacts: false
    }
  }
});

record(viewResult.status === "success", "view_get reads refreshed view from same store world", "");

const graphResult = await runHostModelTool({
  tool_name: "graph_get_person",
  tool_input: {
    person_name: "Bella Xu",
    profile_store_path: profileStorePath,
    graph_review_store_path: graphReviewStorePath,
    options: {
      save_run_artifacts: false
    }
  }
});

record(graphResult.status === "success", "graph_get_person reads from the same committed profile world", "");

const graphReviewCards = await runHostModelTool({
  tool_name: "review_prepare_cards",
  tool_input: {
    graph_result: {
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
    }
  }
});

record(graphReviewCards.source_type === "graph_review", "review_prepare_cards derives graph review cards", "");

const translatedGraphReview = await runHostModelTool({
  tool_name: "review_translate_answers",
  tool_input: {
    source_type: "graph_review",
    commit_id: "host-model-e2e-graph-commit-001",
    graph_result: {
      skill: "relationship-graph",
      review_bundle: { edge_candidates: [] }
    },
    answers: [
      {
        source_person_ref: "person_ava_chen",
        target_person_ref: "person_bella_xu",
        final_action: "reject",
        note: "Only co-occurrence, not a stable edge yet."
      }
    ],
    graph_review_store_path: graphReviewStorePath
  }
});

record(translatedGraphReview.target === "graph_review", "review_translate_answers keeps graph review target", "");
record(translatedGraphReview.commit_id === "host-model-e2e-graph-commit-001", "review_translate_answers keeps graph commit_id", "");

const briefingResult = await runHostModelTool({
  tool_name: "briefing_generate",
  tool_input: {
    target_profile: {
      person_name: "Jordan Li",
      person_ref: "person_jordan_li",
      compiled_truth: {
        summary: "A rational lead who prefers data and clear boundaries.",
        relationship_stage: "stable contact",
        intent: "Clarify whether the project is worth continued investment.",
        attitude: {
          label: "cautious",
          reason: "Wants clear direction before moving forward."
        }
      },
      timeline: [
        {
          date: "2026-04-13",
          event_summary: "Discussed project scope and resource allocation.",
          source_title: "Weather Agent Sync"
        }
      ]
    },
    conversation_goal: "Prepare for a one-on-one conversation to get Jordan's real judgment.",
    conversation_topic: "Project priorities and investment trade-offs",
    recent_interactions: [
      {
        date: "2026-04-13",
        summary: "Jordan emphasized that scope and ownership need to be clear first."
      }
    ],
    host_model: {
      provider: "anthropic-host",
      model: "claude-host",
      target: "claude"
    },
    host_reasoning_output: {
      briefing: {
        quick_brief: "Start with the real judgment, not commitment.",
        relationship_read: {
          current_state: "Stable but cautious working contact",
          likely_intent: "Understand whether the scope is clear enough to justify continued effort",
          attitude: "Cautious but honest when asked for a real read",
          trust_level: "medium"
        },
        approach_strategy: {
          goal_translation: "Get Jordan's real judgment and the minimum conditions for continuing",
          recommended_opening: "Ask for the real read on scope and ownership first",
          recommended_style: "Calm, factual, and low-pressure",
          why_now: "There is enough new context to test whether his prior caution has changed"
        },
        talking_points: ["What changed on scope and ownership?"],
        watchouts: ["Do not over-sell the upside"],
        questions_to_ask: ["What minimum condition would make you keep going?"],
        next_actions: ["Translate his conditions into a concrete next-step decision"]
      },
      notes: "Host-model smoke output."
    },
    options: {
      save_run_artifacts: false,
      write_briefing_file: false
    }
  }
});

record(briefingResult.status === "success", "briefing_generate materializes host reasoning", "");
record(briefingResult.model?.source === "host_model_adapter", "briefing_generate marks host model source", "");
record(briefingResult.briefing_file?.written === false, "briefing_generate respects write_briefing_file=false", "");

const roleplayResult = await runHostModelTool({
  tool_name: "roleplay_generate",
  tool_input: {
    target_profile: {
      person_name: "Jordan Li",
      person_ref: "person_jordan_li",
      compiled_truth: {
        summary: "A rational lead who prefers data and clear boundaries.",
        relationship_stage: "stable contact",
        intent: "Clarify whether the project is worth continued investment.",
        attitude: {
          label: "cautious",
          reason: "Wants clear direction before moving forward."
        }
      }
    },
    conversation_goal: "Simulate a follow-up conversation about whether the project should continue.",
    starting_user_message: "I want to hear your honest judgment on whether this line is worth continuing.",
    host_model: {
      provider: "codex-host",
      model: "codex-host",
      target: "codex"
    },
    host_reasoning_output: {
      simulation: {
        persona_read: {
          current_state: "Open to discussing it, but will first test whether the scope is actually clear.",
          likely_intent: "Figure out whether this is worth continued investment.",
          attitude: "Cautious, not negative.",
          response_style: "State the judgment first, then the boundary."
        },
        opening_assessment: "If the opening is restrained and fact-based, he is likely to stay analytical.",
        simulated_turns: [
          {
            turn: 1,
            user_move: "I want to hear your honest judgment on whether this line is worth continuing.",
            likely_response: "It could be, but only if the scope and owner are clear enough to avoid diffuse effort.",
            why: "He usually gives a cautious judgment first, then defines conditions.",
            risk_level: "low"
          }
        ],
        likely_pushbacks: ["He may push back if the conversation becomes aspirational instead of concrete."],
        recommended_replies: ["Acknowledge the caution and keep the discussion on ownership and real constraints."],
        danger_zones: ["Do not frame the conversation as a loyalty test."],
        if_conversation_goes_well: ["Ask him to define the minimum conditions for continued investment."]
      },
      coach_feedback: {
        keep_doing: ["Ask for the judgment first, then the conditions."],
        avoid: ["Do not push for commitment too early."],
        recovery_moves: ["If he becomes reserved, restate that you are only trying to confirm the real constraints."]
      }
    },
    options: {
      save_run_artifacts: false
    }
  }
});

record(roleplayResult.status === "success", "roleplay_generate materializes host reasoning", "");
record(roleplayResult.model?.source === "host_model_adapter", "roleplay_generate marks host model source", "");
record(Array.isArray(roleplayResult.simulation?.simulated_turns) && roleplayResult.simulation.simulated_turns.length >= 1, "roleplay_generate returns simulated turns", "");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
