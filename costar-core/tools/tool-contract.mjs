// SPDX-License-Identifier: Apache-2.0

const TOOL_DEFINITIONS = [
  {
    name: "capture_ingest_sources",
    category: "host_orchestrated",
    read_only: false,
    requires_host_reasoning: true,
    purpose: "Ingest raw sources into CoStar and produce structured relationship candidates, feedback, and review bundles.",
    input_contract: {
      required: ["sources"],
      optional: [
        "request_id",
        "goal",
        "target_people",
        "focus_people",
        "focus_instruction",
        "existing_people",
        "profile_store_path",
        "host_model",
        "host_reasoning_output",
        "options"
      ],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json"
      }
    },
    output_contract: {
      canonical_result_field: "ingestion_result",
      primary_fields: [
        "receipt",
        "processing_feedback",
        "confirmation_request",
        "next_action",
        "user_feedback",
        "ingestion_result"
      ]
    },
    side_effects: ["none by default", "may read profile store for auto-context recall"],
    receipt_required: true,
    commit_target: null
  },
  {
    name: "capture_get_feedback",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Summarize a prior capture/ingestion result into user-facing receipts and next actions.",
    input_contract: {
      required: ["ingestion_result"],
      optional: ["profile_store_path", "options"],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json"
      }
    },
    output_contract: {
      primary_fields: [
        "receipt",
        "processing_feedback",
        "confirmation_request",
        "next_action",
        "user_feedback"
      ]
    },
    side_effects: [],
    receipt_required: true,
    commit_target: null
  },
  {
    name: "review_list_candidates",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "List pending candidate people or relationship edges that still require user confirmation.",
    input_contract: {
      required: [],
      optional: ["ingestion_result", "graph_result"]
    },
    output_contract: {
      primary_fields: ["review_candidates", "review_type", "pending_count"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "review_prepare_cards",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Turn profile or graph review candidates into stable host-facing prompt cards with a canonical answer schema.",
    input_contract: {
      required: [],
      optional: ["ingestion_result", "graph_result", "limit", "options"]
    },
    output_contract: {
      primary_fields: ["status", "source_type", "pending_count", "explanation", "candidates_preview", "prompt_cards"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "review_translate_answers",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Translate host review answers into the canonical CoStar commit payload without inventing a second write format.",
    input_contract: {
      required: ["source_type", "answers"],
      optional: [
        "ingestion_result",
        "graph_result",
        "profile_store_path",
        "graph_review_store_path",
        "commit_id",
        "commit_log_path",
        "operator",
        "notes",
        "options"
      ]
    },
    output_contract: {
      primary_fields: ["target", "commit_request"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "review_commit_decisions",
    category: "commit",
    read_only: false,
    requires_host_reasoning: false,
    purpose: "Commit reviewed profile or graph decisions into the canonical CoStar stores.",
    input_contract: {
      required: ["target", "commit_request"],
      optional: ["commit_id", "commit_log_path"],
      aliases: {
        decisions: "commit_request.review_decisions"
      },
      nested: {
        commit_request: {
          profile_review: {
            required: ["ingestion_result", "review_decisions"],
            accepted_aliases: ["decisions"],
            accepted_ingestion_result_shapes: [
              "capture_ingest_sources.ingestion_result",
              "full capture_ingest_sources response containing ingestion_result",
              "relationship-ingestion-shaped object with detected_people/resolved_people/person_profiles"
            ],
            optional: ["profile_store_path", "operator", "notes", "options"],
            default_paths: {
              profile_store_path: "relationship-ingestion/runtime/stores/relationship-profile-store.json"
            }
          },
          graph_review: {
            required: ["graph_result", "review_decisions"],
            accepted_aliases: ["decisions"],
            optional: ["graph_review_store_path", "operator", "notes", "options"],
            default_paths: {
              graph_review_store_path: "relationship-graph/runtime/stores/relationship-graph-review-store.json"
            }
          }
        }
      },
      samples: [
        "costar-core/host-model-adapter/samples/commit-decisions.request.example.json"
      ]
    },
    output_contract: {
      primary_fields: [
        "commit_id",
        "is_replay",
        "review_summary",
        "profile_store_delta",
        "graph_review_store_delta",
        "commit_feedback"
      ]
    },
    side_effects: ["writes store data through the only approved commit path"],
    receipt_required: true,
    commit_target: "profile_review | graph_review"
  },
  {
    name: "memory_review_prepare_cards",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Turn memory candidates into stable host-facing review cards with source evidence and a canonical answer schema.",
    input_contract: {
      required: ["candidates"],
      optional: ["source_refs", "limit", "options"]
    },
    output_contract: {
      primary_fields: ["status", "source_type", "pending_count", "explanation", "candidates_preview", "prompt_cards"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "memory_review_translate_answers",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Translate host memory review answers into the canonical memory_review commit payload.",
    input_contract: {
      required: ["memory_store_path", "candidates", "answers"],
      optional: ["source_refs", "commit_id", "commit_log_path", "operator", "notes", "options"]
    },
    output_contract: {
      primary_fields: ["target", "commit_id", "commit_request"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "memory_commit_decisions",
    category: "commit",
    read_only: false,
    requires_host_reasoning: false,
    purpose: "Commit reviewed memory candidates into the canonical CoStar atomic memory store.",
    input_contract: {
      required: ["memory_store_path", "candidates", "review_decisions"],
      optional: ["source_refs", "commit_id", "commit_log_path", "operator", "notes", "options"],
      aliases: {
        store_path: "memory_store_path",
        decisions: "review_decisions"
      },
      default_paths: {
        memory_store_path: "costar-core/memory/runtime/stores/memory-store.json"
      }
    },
    output_contract: {
      primary_fields: ["status", "memory_store_path", "memory_store_delta", "committed_records", "user_feedback"]
    },
    side_effects: ["writes atomic memory store through the only approved memory commit path"],
    receipt_required: true,
    commit_target: "memory_review"
  },
  {
    name: "memory_lint",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Check the atomic memory store for overdue commitments, stale facts, isolated entities, conflicts, and knowledge gaps.",
    input_contract: {
      required: ["memory_store_path"],
      optional: ["now", "zombie_days", "zombieDays"],
      aliases: {
        store_path: "memory_store_path",
        storePath: "memory_store_path"
      },
      default_paths: {
        memory_store_path: "costar-core/memory/runtime/stores/memory-store.json"
      }
    },
    output_contract: {
      primary_fields: ["status", "issue_counts", "issues", "markdown_report"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "memory_feedback_record",
    category: "commit",
    read_only: false,
    requires_host_reasoning: false,
    purpose: "Record user feedback about a memory fact or generated artifact, update quality counters, and optionally create a reflection candidate.",
    input_contract: {
      required: ["memory_store_path", "target_type", "feedback_type"],
      optional: [
        "target_id",
        "user_note",
        "source_refs",
        "proposed_reflection",
        "operator",
        "metadata"
      ],
      aliases: {
        store_path: "memory_store_path"
      },
      default_paths: {
        memory_store_path: "costar-core/memory/runtime/stores/memory-store.json"
      }
    },
    output_contract: {
      primary_fields: ["status", "memory_store_path", "feedback_event", "reflection_candidate", "memory_store_delta"]
    },
    side_effects: ["writes feedback_events and may update fact quality counters or reflection_candidates"],
    receipt_required: true,
    commit_target: "memory_feedback"
  },
  {
    name: "memory_reflection_prepare_cards",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Turn pending memory reflection candidates into user-confirmable review cards.",
    input_contract: {
      required: ["reflection_candidates"],
      optional: ["limit"]
    },
    output_contract: {
      primary_fields: ["status", "source_type", "pending_count", "explanation", "candidates_preview", "prompt_cards"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "memory_reflection_commit",
    category: "commit",
    read_only: false,
    requires_host_reasoning: false,
    purpose: "Commit user-confirmed reflection candidates into active extraction hints in the same memory store.",
    input_contract: {
      required: ["memory_store_path", "review_decisions"],
      optional: ["operator"],
      aliases: {
        store_path: "memory_store_path",
        decisions: "review_decisions"
      },
      default_paths: {
        memory_store_path: "costar-core/memory/runtime/stores/memory-store.json"
      }
    },
    output_contract: {
      primary_fields: ["status", "memory_store_path", "memory_store_delta"]
    },
    side_effects: ["updates reflection_candidates and writes active hints"],
    receipt_required: true,
    commit_target: "memory_reflection"
  },
  {
    name: "memory_hints_get",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Retrieve confirmed extraction hints for a person, field type, or global scope before capture or briefing.",
    input_contract: {
      required: ["memory_store_path"],
      optional: ["scope", "limit"],
      aliases: {
        store_path: "memory_store_path"
      },
      default_paths: {
        memory_store_path: "costar-core/memory/runtime/stores/memory-store.json"
      }
    },
    output_contract: {
      primary_fields: ["status", "memory_store_path", "scope", "hint_count", "hints"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "memory_feedback_report",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Summarize feedback events, review diffs, reflection review status, and active hint count for memory iteration.",
    input_contract: {
      required: ["memory_store_path"],
      optional: [],
      aliases: {
        store_path: "memory_store_path"
      },
      default_paths: {
        memory_store_path: "costar-core/memory/runtime/stores/memory-store.json"
      }
    },
    output_contract: {
      primary_fields: [
        "status",
        "feedback_type_counts",
        "fact_quality_summary",
        "review_diff_summary",
        "reflection_summary",
        "hint_count"
      ]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "profile_get",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Read a single relationship profile from the canonical profile store.",
    input_contract: {
      required: [],
      optional: ["person_name", "person_ref", "profile_store_path", "options"],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json"
      }
    },
    output_contract: {
      primary_fields: ["target_person", "profile_read", "related_people", "maintenance_report"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "profile_search",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Search relationship profiles by name, tags, or maintenance filters.",
    input_contract: {
      required: [],
      optional: ["query_text", "filters", "profile_store_path", "options"],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json"
      }
    },
    output_contract: {
      primary_fields: ["search_results", "store_overview"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "briefing_generate",
    category: "host_orchestrated",
    read_only: false,
    requires_host_reasoning: true,
    purpose: "Generate a conversation briefing using host reasoning on top of CoStar profile and view context.",
    input_contract: {
      required: ["conversation_goal"],
      optional: [
        "person_name",
        "person_ref",
        "target_profile",
        "profile_store_path",
        "memory_store_path",
        "meeting_context",
        "recent_interactions",
        "constraints",
        "host_model",
        "host_reasoning_output",
        "options"
      ],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json",
        memory_store_path: "costar-core/memory/runtime/stores/memory-store.json"
      },
      host_reasoning_output_schema: {
        wrapper: "host_reasoning_output.briefing",
        alternate_top_level: true,
        required: [
          "quick_brief",
          "relationship_read",
          "approach_strategy",
          "talking_points",
          "watchouts",
          "questions_to_ask",
          "next_actions"
        ],
        optional: ["open_questions", "notes"]
      }
    },
    output_contract: {
      primary_fields: ["briefing", "briefing_file", "facts_included", "memory_evidence", "receipt", "host_model"]
    },
    side_effects: ["may write briefing markdown if enabled", "may write memory artifact when memory_store_path is supplied"],
    receipt_required: true,
    commit_target: null
  },
  {
    name: "roleplay_generate",
    category: "host_orchestrated",
    read_only: false,
    requires_host_reasoning: true,
    purpose: "Generate a roleplay simulation from a relationship profile using host reasoning.",
    input_contract: {
      required: ["conversation_goal"],
      optional: ["person_name", "person_ref", "target_profile", "profile_store_path", "host_model", "host_reasoning_output", "options"],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json"
      }
    },
    output_contract: {
      primary_fields: [
        "persona_read",
        "simulated_turns",
        "likely_pushbacks",
        "recommended_replies",
        "coach_feedback",
        "host_model"
      ]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "graph_get_person",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Build the local relationship graph around one target person.",
    input_contract: {
      required: [],
      optional: ["person_name", "person_ref", "profile_store_path", "graph_review_store_path", "options"],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json",
        graph_review_store_path: "relationship-graph/runtime/stores/relationship-graph-review-store.json"
      }
    },
    output_contract: {
      primary_fields: ["graph", "related_people", "user_feedback", "review_bundle", "render_artifacts"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "graph_find_path",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Find a connection path between two people using the canonical graph logic.",
    input_contract: {
      required: [],
      optional: [
        "source_person_name",
        "source_person_ref",
        "target_person_name",
        "target_person_ref",
        "profile_store_path",
        "graph_review_store_path",
        "options"
      ],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json",
        graph_review_store_path: "relationship-graph/runtime/stores/relationship-graph-review-store.json"
      }
    },
    output_contract: {
      primary_fields: ["connection_path", "graph", "user_feedback", "review_bundle", "render_artifacts"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "view_get",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Read a persistent person view from the canonical view store.",
    input_contract: {
      required: [],
      optional: ["person_name", "person_ref", "profile_store_path", "graph_review_store_path", "view_store_path", "options"],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json",
        graph_review_store_path: "relationship-graph/runtime/stores/relationship-graph-review-store.json",
        view_store_path: "relationship-view/runtime/stores/relationship-view-store.json"
      }
    },
    output_contract: {
      primary_fields: ["person_view", "store_overview", "user_feedback"]
    },
    side_effects: [],
    receipt_required: false,
    commit_target: null
  },
  {
    name: "view_refresh",
    category: "deterministic",
    read_only: false,
    requires_host_reasoning: false,
    purpose: "Refresh one or more persistent person views from the canonical stores.",
    input_contract: {
      required: [],
      optional: [
        "person_name",
        "person_ref",
        "people",
        "profile_store_path",
        "graph_review_store_path",
        "view_store_path",
        "options"
      ],
      default_paths: {
        profile_store_path: "relationship-profile/runtime/stores/relationship-profile-store.json",
        graph_review_store_path: "relationship-graph/runtime/stores/relationship-graph-review-store.json",
        view_store_path: "relationship-view/runtime/stores/relationship-view-store.json"
      }
    },
    output_contract: {
      primary_fields: ["refreshed_views", "view_store_delta", "user_feedback"]
    },
    side_effects: ["writes persistent view store and markdown views when enabled"],
    receipt_required: true,
    commit_target: null
  }
];

export function getHostModelToolContractV1() {
  return {
    contract_name: "CoStar Host-model Tool Contract v1",
    version: "0.1.0",
    tools: TOOL_DEFINITIONS.map((tool) => ({ ...tool }))
  };
}

export function listHostModelTools() {
  return TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    category: tool.category,
    read_only: tool.read_only,
    requires_host_reasoning: tool.requires_host_reasoning,
    purpose: tool.purpose
  }));
}

export function getHostModelToolDefinition(toolName) {
  const normalized = String(toolName ?? "").trim();
  return TOOL_DEFINITIONS.find((tool) => tool.name === normalized) || null;
}
