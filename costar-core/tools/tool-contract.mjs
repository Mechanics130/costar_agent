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
      ]
    },
    output_contract: {
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
      optional: ["profile_store_path", "options"]
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
      primary_fields: ["source_type", "pending_count", "prompt_cards"]
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
      optional: ["commit_id", "commit_log_path"]
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
    name: "profile_get",
    category: "deterministic",
    read_only: true,
    requires_host_reasoning: false,
    purpose: "Read a single relationship profile from the canonical profile store.",
    input_contract: {
      required: [],
      optional: ["person_name", "person_ref", "profile_store_path", "options"]
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
      optional: ["query_text", "filters", "profile_store_path", "options"]
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
        "meeting_context",
        "recent_interactions",
        "constraints",
        "host_model",
        "host_reasoning_output",
        "options"
      ]
    },
    output_contract: {
      primary_fields: ["briefing", "briefing_file", "receipt", "host_model"]
    },
    side_effects: ["may write briefing markdown if enabled"],
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
      optional: ["person_name", "person_ref", "target_profile", "profile_store_path", "host_model", "host_reasoning_output", "options"]
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
      optional: ["person_name", "person_ref", "profile_store_path", "graph_review_store_path", "options"]
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
      ]
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
      optional: ["person_name", "person_ref", "profile_store_path", "graph_review_store_path", "view_store_path", "options"]
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
      ]
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
