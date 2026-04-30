// SPDX-License-Identifier: Apache-2.0

export function buildMemoryReviewCards({ candidates = [], source_refs: sourceRefs = [], limit = 10 } = {}) {
  const pending = normalizeArray(candidates).filter((candidate) => normalizeString(candidate.review_status) === "pending");
  const maxCards = clampInteger(limit, pending.length || 10, 1, 50);
  const promptCards = pending.slice(0, maxCards).map((candidate) => ({
    review_type: "memory_review",
    candidate_id: normalizeString(candidate.candidate_id),
    candidate_type: normalizeString(candidate.candidate_type),
    suggested_action: normalizeString(candidate.suggested_action),
    target_entity_hint: normalizeObject(candidate.target_entity_hint),
    proposed_value: normalizeObject(candidate.proposed_value),
    confidence: normalizeString(candidate.confidence) || "inferred",
    source_id: normalizeString(candidate.source_id),
    source_excerpt: normalizeString(candidate.source_excerpt),
    source_ref: findSourceRef(sourceRefs, candidate.source_id),
    default_decision: defaultDecisionForCandidate(candidate),
    response_schema: {
      candidate_id: normalizeString(candidate.candidate_id),
      final_action: "accept | edit | reject | defer",
      overrides: "optional object with edited proposed_value, confidence, target_entity_hint, or source_excerpt",
      notes: "optional string"
    }
  }));

  return {
    status: promptCards.length ? "needs_user_review" : "no_review_required",
    source_type: "memory_review",
    pending_count: pending.length,
    explanation: promptCards.length
      ? `${promptCards.length} memory review card(s) are ready for explicit user confirmation.`
      : "No memory review cards were created because there are no pending memory candidates.",
    candidates_preview: pending.slice(0, maxCards).map((candidate) => ({
      candidate_id: normalizeString(candidate.candidate_id),
      candidate_type: normalizeString(candidate.candidate_type),
      confidence: normalizeString(candidate.confidence),
      proposed_value: normalizeObject(candidate.proposed_value),
      source_excerpt: normalizeString(candidate.source_excerpt)
    })),
    prompt_cards: promptCards
  };
}

export function translateMemoryReviewAnswers(payload = {}) {
  const answers = normalizeArray(payload.answers);
  return answers
    .map((answer) => ({
      candidate_id: normalizeString(answer?.candidate_id),
      decision: normalizeDecision(answer?.final_action || answer?.decision),
      overrides: normalizeObject(answer?.overrides),
      notes: normalizeString(answer?.notes || answer?.note)
    }))
    .filter((answer) => answer.candidate_id);
}

function defaultDecisionForCandidate(candidate) {
  const confidence = normalizeString(candidate?.confidence);
  if (confidence === "speculative") {
    return "defer";
  }
  if (normalizeString(candidate?.suggested_action) === "reject") {
    return "reject";
  }
  return "accept";
}

function findSourceRef(sourceRefs, sourceId) {
  const normalizedSourceId = normalizeString(sourceId);
  return normalizeArray(sourceRefs).find((source) => normalizeString(source?.source_id) === normalizedSourceId) || null;
}

function normalizeDecision(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (["accept", "accepted", "confirm", "confirmed"].includes(normalized)) return "accepted";
  if (["edit", "edited", "modify", "modified"].includes(normalized)) return "edited";
  if (["reject", "rejected", "ignore"].includes(normalized)) return "rejected";
  return "deferred";
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
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
