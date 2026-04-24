// SPDX-License-Identifier: Apache-2.0

export function buildHostReviewPrompt(result, options = {}) {
  const stage = normalizeString(result?.stage);
  if (stage === "ingestion") {
    return buildProfileReviewPrompt(result, options);
  }
  if (result?.skill === "relationship-graph" || result?.graph?.nodes || result?.review_bundle?.edge_candidates) {
    return buildGraphReviewPrompt(result, options);
  }
  throw new Error("Unsupported review prompt input. Expected capture ingestion result or graph result.");
}

export function translateHostReviewAnswers(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("translateHostReviewAnswers requires a JSON object.");
  }

  const sourceType = normalizeString(payload.source_type);
  const answers = Array.isArray(payload.answers) ? payload.answers : [];

  if (sourceType === "profile_review") {
    return {
      target: "profile_review",
      commit_id: normalizeString(payload.commit_id),
      commit_log_path: normalizeString(payload.commit_log_path),
      commit_request: {
        ingestion_result: payload.ingestion_result,
        review_decisions: answers.map(normalizeProfileReviewAnswer),
        profile_store_path: normalizeString(payload.profile_store_path),
        operator: normalizeString(payload.operator),
        notes: normalizeString(payload.notes),
        options: payload.options && typeof payload.options === "object" ? payload.options : {}
      }
    };
  }

  if (sourceType === "graph_review") {
    return {
      target: "graph_review",
      commit_id: normalizeString(payload.commit_id),
      commit_log_path: normalizeString(payload.commit_log_path),
      commit_request: {
        graph_result: payload.graph_result,
        review_decisions: answers.map(normalizeGraphReviewAnswer),
        graph_review_store_path: normalizeString(payload.graph_review_store_path),
        operator: normalizeString(payload.operator),
        notes: normalizeString(payload.notes),
        options: payload.options && typeof payload.options === "object" ? payload.options : {}
      }
    };
  }

  throw new Error("source_type must be profile_review or graph_review.");
}

function buildProfileReviewPrompt(result, options) {
  const candidates = Array.isArray(result?.confirmation_request?.top_candidates)
    ? result.confirmation_request.top_candidates
    : Array.isArray(result?.review_bundle?.candidates)
      ? result.review_bundle.candidates
      : [];
  const limit = clampInteger(options.limit, candidates.length || 10, 1, 50);
  const prompt = candidates.slice(0, limit).map((candidate) => ({
    review_type: "profile_review",
    person_name: normalizeString(candidate.person_name),
    suggested_action: normalizeString(candidate.suggested_action) || "review",
    priority: normalizeString(candidate.priority) || "medium",
    needs_confirmation: Boolean(candidate.needs_confirmation),
    questions: Array.isArray(candidate.questions) ? candidate.questions : [],
    evidence_preview: Array.isArray(candidate.evidence_preview) ? candidate.evidence_preview : [],
    response_schema: {
      person_name: normalizeString(candidate.person_name),
      final_action: "create | update | ignore | defer",
      resolved_person_ref: "optional string",
      resolved_person_name: "optional string",
      profile_tier: "optional stub | active | key | archived",
      notes: "optional string"
    }
  }));

  return {
    source_type: "profile_review",
    pending_count: Number(result?.confirmation_request?.pending_count || result?.review_bundle?.pending_count || candidates.length || prompt.length),
    prompt_cards: prompt
  };
}

function buildGraphReviewPrompt(result, options) {
  const candidates = Array.isArray(result?.review_bundle?.edge_candidates)
    ? result.review_bundle.edge_candidates
    : [];
  const limit = clampInteger(options.limit, candidates.length || 10, 1, 50);
  const prompt = candidates.slice(0, limit).map((candidate) => ({
    review_type: "graph_review",
    source_person_name: normalizeString(candidate.source_person_name),
    source_person_ref: normalizeString(candidate.source_person_ref),
    target_person_name: normalizeString(candidate.target_person_name),
    target_person_ref: normalizeString(candidate.target_person_ref),
    relation_type: normalizeString(candidate.relation_type),
    relation_score: Number(candidate.relation_score || 0),
    reason: normalizeString(candidate.reason),
    suggested_action: normalizeString(candidate.suggested_action) || "review",
    review_priority: Number(candidate.review_priority || 0),
    response_schema: {
      source_person_ref: normalizeString(candidate.source_person_ref),
      source_person_name: normalizeString(candidate.source_person_name),
      target_person_ref: normalizeString(candidate.target_person_ref),
      target_person_name: normalizeString(candidate.target_person_name),
      final_action: "confirm | reject | downgrade | reclassify | defer",
      corrected_relation_type: "optional string",
      note: "optional string"
    }
  }));

  return {
    source_type: "graph_review",
    pending_count: prompt.length,
    prompt_cards: prompt
  };
}

function normalizeProfileReviewAnswer(answer) {
  return {
    person_name: normalizeString(answer?.person_name),
    final_action: normalizeString(answer?.final_action).toLowerCase(),
    resolved_person_ref: normalizeString(answer?.resolved_person_ref),
    resolved_person_name: normalizeString(answer?.resolved_person_name),
    profile_tier: normalizeString(answer?.profile_tier).toLowerCase(),
    notes: normalizeString(answer?.notes || answer?.note)
  };
}

function normalizeGraphReviewAnswer(answer) {
  return {
    source_person_ref: normalizeString(answer?.source_person_ref),
    source_person_name: normalizeString(answer?.source_person_name),
    target_person_ref: normalizeString(answer?.target_person_ref),
    target_person_name: normalizeString(answer?.target_person_name),
    final_action: normalizeString(answer?.final_action).toLowerCase(),
    corrected_relation_type: normalizeString(answer?.corrected_relation_type),
    note: normalizeString(answer?.note || answer?.notes)
  };
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function clampInteger(value, fallback, min, max) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(candidate)));
}
