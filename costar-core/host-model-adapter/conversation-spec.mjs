// SPDX-License-Identifier: Apache-2.0

const HOST_VARIANTS = {
  claude: {
    host_name: "Claude",
    tone: "concise, supervisory, and calm",
    emphasis: "Show concise receipts and ask for confirmation only when CoStar requires it."
  },
  codex: {
    host_name: "Codex",
    tone: "direct, structured, and execution-oriented",
    emphasis: "Keep each step grounded in tool output and next actions."
  },
  openclaw: {
    host_name: "OpenClaw",
    tone: "practical, concise, and user-facing",
    emphasis: "Use the host model for reasoning, then route every durable write through CoStar tools."
  }
};

const SHARED_PHASES = [
  {
    phase_id: "ingest_feedback",
    title: "Ingest and feedback",
    goal: "Turn raw source material into a visible CoStar receipt before any durable write.",
    trigger: "User imports notes, a transcript, or any new relationship source.",
    required_tools: ["capture_ingest_sources", "capture_get_feedback"],
    user_visible_sections: [
      "what was ingested",
      "who was identified or updated",
      "whether confirmation is required",
      "next recommended action"
    ],
    gating_rule: "Do not claim anything is committed yet."
  },
  {
    phase_id: "profile_review",
    title: "Profile review",
    goal: "Turn candidate people into structured review cards and collect explicit user decisions.",
    trigger: "Ingest feedback shows pending people or relationship updates requiring confirmation.",
    required_tools: ["review_prepare_cards", "review_translate_answers", "review_commit_decisions"],
    user_visible_sections: [
      "candidate name",
      "suggested action",
      "why it needs confirmation",
      "evidence preview",
      "answer choices"
    ],
    gating_rule: "Do not write any profile state until `review_commit_decisions` succeeds."
  },
  {
    phase_id: "graph_review",
    title: "Graph review",
    goal: "Confirm, reject, or reclassify weak graph edges through the same review path.",
    trigger: "A graph response includes `review_bundle.edge_candidates`.",
    required_tools: ["review_prepare_cards", "review_translate_answers", "review_commit_decisions"],
    user_visible_sections: [
      "source and target people",
      "relation type",
      "confidence or score",
      "reason this edge is weak",
      "confirm / reject / reclassify choices"
    ],
    gating_rule: "Do not present weak edges as established truth."
  },
  {
    phase_id: "commit_receipt",
    title: "Commit receipt",
    goal: "Tell the user exactly what durable state changed after commit.",
    trigger: "`review_commit_decisions` returns success.",
    required_tools: ["review_commit_decisions"],
    user_visible_sections: [
      "which profiles or graph edges were updated",
      "what was deferred or ignored",
      "which store/view assets were affected"
    ],
    gating_rule: "Always mention whether the commit was profile or graph scoped."
  },
  {
    phase_id: "view_refresh",
    title: "View refresh",
    goal: "Refresh the persistent view so the user can re-open the same asset later.",
    trigger: "A successful profile or graph commit finishes.",
    required_tools: ["view_refresh", "view_get"],
    user_visible_sections: [
      "which views were refreshed",
      "where the durable view now lives",
      "what the user can open next"
    ],
    gating_rule: "Do not skip refresh if the user expects persistent state."
  },
  {
    phase_id: "briefing_followup",
    title: "Briefing follow-up",
    goal: "Generate a briefing from the same committed CoStar world.",
    trigger: "User asks how to prepare for a conversation after context is imported.",
    required_tools: ["profile_get", "view_get", "briefing_generate"],
    user_visible_sections: [
      "briefing summary",
      "recommended approach",
      "watchouts",
      "next actions"
    ],
    gating_rule: "Do not invent context that is missing from CoStar."
  },
  {
    phase_id: "roleplay_followup",
    title: "Roleplay follow-up",
    goal: "Simulate a conversation from the same committed CoStar world.",
    trigger: "User asks to rehearse or test a conversation.",
    required_tools: ["profile_get", "view_get", "roleplay_generate"],
    user_visible_sections: [
      "persona read",
      "simulated turns",
      "likely pushbacks",
      "recommended replies"
    ],
    gating_rule: "Roleplay should stay aligned with the stored relationship context."
  }
];

const SHARED_RULES = [
  "Never create a second CoStar data world inside the host conversation.",
  "Always distinguish between feedback, review, and committed state.",
  "Use review cards for high-risk inferences instead of silent auto-commits.",
  "Treat `view_refresh` as the durable closing step after a successful commit.",
  "Prefer receipts and next actions over long freeform narration."
];

export function buildHostConversationSpec(host = "claude") {
  const normalized = String(host || "claude").trim().toLowerCase();
  const config = HOST_VARIANTS[normalized];
  if (!config) {
    throw new Error(`Unsupported host conversation spec target: ${host}`);
  }

  return {
    spec_name: "CoStar Host Conversation Spec v1",
    version: "0.1.0",
    host: normalized,
    host_name: config.host_name,
    tone: config.tone,
    emphasis: config.emphasis,
    hard_rules: [...SHARED_RULES],
    phases: SHARED_PHASES.map((phase) => ({ ...phase }))
  };
}
