// SPDX-License-Identifier: Apache-2.0
import { getExtractionWarningsForPerson } from "../host-model-workflows/extraction-guardrails.mjs";

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
        ingestion_result: normalizeProfileIngestionResult(payload.ingestion_result),
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
  const candidatesPreview = buildProfileCandidatesPreview(result);
  const prompt = candidates.slice(0, limit).map((candidate) => ({
    review_type: "profile_review",
    person_name: normalizeString(candidate.person_name),
    suggested_action: normalizeString(candidate.suggested_action) || "review",
    priority: normalizeString(candidate.priority) || "medium",
    needs_confirmation: Boolean(candidate.needs_confirmation),
    questions: Array.isArray(candidate.questions) ? candidate.questions : [],
    fields_to_confirm: Array.isArray(candidate.fields_to_confirm) ? candidate.fields_to_confirm : [],
    evidence_preview: Array.isArray(candidate.evidence_preview) ? candidate.evidence_preview : [],
    insight_preview: buildCandidateInsightPreview(candidate),
    extraction_warnings: getExtractionWarningsForPerson(result, candidate.person_name),
    response_schema: {
      person_name: normalizeString(candidate.person_name),
      final_action: "create | update | ignore | defer",
      resolved_person_ref: "optional string",
      resolved_person_name: "optional string",
      profile_tier: "optional stub | active | key | archived",
      overrides: "optional object with confirmed summary, insight fields, aliases, timeline_append, or next_actions",
      notes: "optional string"
    }
  }));
  const status = prompt.length ? "needs_user_review" : "no_review_required";
  const explanation = prompt.length
    ? `${prompt.length} profile review card(s) are ready for explicit user confirmation.`
    : candidatesPreview.length
      ? "No review cards were created because CoStar found no pending review candidates; candidates_preview lists detected/resolved people for visibility."
      : "No review cards were created because the ingestion result did not include pending review candidates or visible detected/resolved people.";

  return {
    status,
    source_type: "profile_review",
    pending_count: Number(result?.confirmation_request?.pending_count || result?.review_bundle?.pending_count || candidates.length || prompt.length),
    explanation,
    candidates_preview: candidatesPreview,
    profile_tier_glossary: {
      stub: "thin cold-start profile; enough to remember the person, not enough for strong judgment",
      active: "usable working profile with actionable relationship signals",
      key: "important relationship profile that deserves priority tracking",
      archived: "inactive or intentionally deprioritized profile"
    },
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
    status: prompt.length ? "needs_user_review" : "no_review_required",
    source_type: "graph_review",
    pending_count: prompt.length,
    explanation: prompt.length
      ? `${prompt.length} graph review card(s) are ready for explicit user confirmation.`
      : "No graph review cards were created because CoStar found no pending edge candidates.",
    candidates_preview: candidates.slice(0, limit).map((candidate) => ({
      source_person_name: normalizeString(candidate.source_person_name),
      target_person_name: normalizeString(candidate.target_person_name),
      relation_type: normalizeString(candidate.relation_type),
      relation_score: Number(candidate.relation_score || 0)
    })),
    prompt_cards: prompt
  };
}

function normalizeProfileIngestionResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  if (value.ingestion_result && typeof value.ingestion_result === "object" && !Array.isArray(value.ingestion_result)) {
    return value.ingestion_result;
  }
  if (value.skill === "relationship-ingestion") {
    return value;
  }
  if (looksLikeIngestionResult(value)) {
    return {
      ...value,
      skill: "relationship-ingestion"
    };
  }
  return value;
}

function looksLikeIngestionResult(value) {
  return Boolean(
    value
      && typeof value === "object"
      && (
        Array.isArray(value.detected_people)
        || Array.isArray(value.resolved_people)
        || Array.isArray(value.person_profiles)
        || Array.isArray(value.review_bundle?.candidates)
      )
  );
}

function buildProfileCandidatesPreview(result) {
  const previewMap = new Map();
  collectProfilePreviewItems(previewMap, result?.resolved_people, "resolved_people");
  collectProfilePreviewItems(previewMap, result?.person_profiles, "person_profiles");
  collectProfilePreviewItems(previewMap, result?.detected_people, "detected_people");
  collectProfilePreviewItems(previewMap, result?.confirmation_request?.top_candidates, "confirmation_request");
  collectProfilePreviewItems(previewMap, result?.review_bundle?.candidates, "review_bundle");
  return Array.from(previewMap.values()).map((item) => {
    const extractionWarnings = getExtractionWarningsForPerson(result, item.person_name);
    return extractionWarnings.length
      ? { ...item, extraction_warnings: extractionWarnings }
      : item;
  });
}

function collectProfilePreviewItems(previewMap, items, source) {
  if (!Array.isArray(items)) {
    return;
  }
  items.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const personName = normalizeString(item.person_name || item.name);
    if (!personName) {
      return;
    }
    const key = personName.toLowerCase();
    const existing = previewMap.get(key) || {
      person_name: personName,
      sources: []
    };
    const next = {
      ...existing,
      person_name: existing.person_name || personName,
      resolution_action: firstNonEmpty([existing.resolution_action, item.resolution_action, item.suggested_action]),
      confidence: firstNonEmpty([existing.confidence, item.confidence]),
      profile_tier: firstNonEmpty([existing.profile_tier, item.profile_tier]),
      evidence_preview: normalizeStringArray([
        ...(Array.isArray(existing.evidence_preview) ? existing.evidence_preview : []),
        ...(Array.isArray(item.evidence_preview) ? item.evidence_preview : []),
        ...(Array.isArray(item.evidence) ? item.evidence : [])
      ]).slice(0, 3),
      sources: normalizeStringArray([...existing.sources, source])
    };
    previewMap.set(key, next);
  });
}

function normalizeProfileReviewAnswer(answer) {
  return {
    person_name: normalizeString(answer?.person_name),
    final_action: normalizeString(answer?.final_action).toLowerCase(),
    resolved_person_ref: normalizeString(answer?.resolved_person_ref),
    resolved_person_name: normalizeString(answer?.resolved_person_name),
    profile_tier: normalizeString(answer?.profile_tier).toLowerCase(),
    notes: normalizeString(answer?.notes || answer?.note),
    overrides: answer?.overrides && typeof answer.overrides === "object" && !Array.isArray(answer.overrides)
      ? answer.overrides
      : {}
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
    relation_type: normalizeString(answer?.relation_type),
    relation_score: Number.isFinite(Number(answer?.relation_score)) ? Number(answer.relation_score) : 0,
    note: normalizeString(answer?.note || answer?.notes)
  };
}

function buildCandidateInsightPreview(candidate) {
  const fields = Array.isArray(candidate?.fields_to_confirm) ? candidate.fields_to_confirm : [];
  const getField = (fieldName) => fields.find((field) => normalizeString(field?.field) === fieldName)?.current_value;
  return {
    latent_needs: getField("compiled_truth.latent_needs") || null,
    key_issues: getField("compiled_truth.key_issues") || null,
    attitude_intent: getField("compiled_truth.attitude_intent") || null,
    timeline: getField("timeline") || getField("profile.timeline") || null
  };
}

function firstNonEmpty(values) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeStringArray(values) {
  return Array.from(new Set(values.map((value) => normalizeString(value)).filter(Boolean)));
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
