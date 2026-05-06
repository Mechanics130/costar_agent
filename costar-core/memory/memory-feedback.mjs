// SPDX-License-Identifier: Apache-2.0
import { stableMemoryId } from "./memory-ids.mjs";
import { loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";

export function recordMemoryFeedback(payload = {}) {
  const memoryStorePath = normalizeString(payload.memory_store_path || payload.store_path);
  if (!memoryStorePath) {
    throw new Error("recordMemoryFeedback requires memory_store_path.");
  }

  const processedAt = new Date().toISOString();
  const store = loadMemoryStore({ storePath: memoryStorePath });
  const feedbackType = normalizeFeedbackType(payload.feedback_type);
  const targetType = normalizeTargetType(payload.target_type);
  const targetId = normalizeString(payload.target_id);
  const feedback = {
    feedback_id: stableMemoryId("feedback", [
      processedAt,
      targetType,
      targetId,
      feedbackType,
      payload.user_note
    ]),
    target_type: targetType,
    target_id: targetId,
    feedback_type: feedbackType,
    user_note: normalizeString(payload.user_note),
    operator: normalizeString(payload.operator) || "user",
    created_at: processedAt,
    source_refs: normalizeStringArray(payload.source_refs),
    metadata: normalizeObject(payload.metadata)
  };

  const reflection = buildReflectionCandidate({
    proposedReflection: payload.proposed_reflection,
    feedbackId: feedback.feedback_id,
    processedAt
  });

  const next = {
    ...store,
    facts: updateFactQuality({
      facts: store.facts,
      targetType,
      targetId,
      feedbackType
    }),
    feedback_events: [...normalizeArray(store.feedback_events), feedback],
    reflection_candidates: reflection
      ? [...normalizeArray(store.reflection_candidates), reflection]
      : [...normalizeArray(store.reflection_candidates)]
  };

  const write = writeMemoryStore({
    storePath: memoryStorePath,
    store: next,
    processedAt
  });

  return {
    status: "success",
    memory_store_path: write.store_path,
    feedback_event: feedback,
    reflection_candidate: reflection,
    memory_store_delta: {
      feedback_events_added: 1,
      facts_touched: targetType === "fact" && targetId ? 1 : 0,
      reflection_candidates_added: reflection ? 1 : 0
    }
  };
}

export function buildMemoryReflectionCards({ reflection_candidates: reflectionCandidates = [], limit = 10 } = {}) {
  const pending = normalizeArray(reflectionCandidates)
    .filter((candidate) => normalizeString(candidate.review_status) === "pending");
  const maxCards = clampInteger(limit, pending.length || 10, 1, 50);
  const promptCards = pending.slice(0, maxCards).map((candidate) => ({
    review_type: "memory_reflection",
    reflection_id: normalizeString(candidate.reflection_id),
    feedback_id: normalizeString(candidate.feedback_id),
    proposed_reflection: normalizeObject(candidate.proposed_reflection),
    default_decision: "accept",
    response_schema: {
      reflection_id: normalizeString(candidate.reflection_id),
      final_action: "accept | edit | reject | defer",
      overrides: "optional object with confirmed_reflection edits",
      notes: "optional string"
    }
  }));

  return {
    status: promptCards.length ? "needs_user_review" : "no_review_required",
    source_type: "memory_reflection",
    pending_count: pending.length,
    explanation: promptCards.length
      ? `${promptCards.length} memory reflection card(s) are ready for user confirmation.`
      : "No memory reflection cards were created because there are no pending reflection candidates.",
    candidates_preview: pending.slice(0, maxCards).map((candidate) => ({
      reflection_id: normalizeString(candidate.reflection_id),
      feedback_id: normalizeString(candidate.feedback_id),
      proposed_reflection: normalizeObject(candidate.proposed_reflection)
    })),
    prompt_cards: promptCards
  };
}

export function commitMemoryReflectionDecisions(payload = {}) {
  const memoryStorePath = normalizeString(payload.memory_store_path || payload.store_path);
  if (!memoryStorePath) {
    throw new Error("commitMemoryReflectionDecisions requires memory_store_path.");
  }

  const processedAt = new Date().toISOString();
  const store = loadMemoryStore({ storePath: memoryStorePath });
  const decisions = new Map(
    normalizeArray(payload.review_decisions || payload.decisions)
      .map(normalizeReflectionDecision)
      .filter((decision) => decision.reflection_id)
      .map((decision) => [decision.reflection_id, decision])
  );

  const hintsToAdd = [];
  const reflectionCandidates = normalizeArray(store.reflection_candidates).map((candidate) => {
    const decision = decisions.get(normalizeString(candidate.reflection_id));
    if (!decision) {
      return candidate;
    }
    const status = reflectionStatusForDecision(decision.decision);
    const confirmedReflection = decision.decision === "edited"
      ? {
          ...normalizeObject(candidate.proposed_reflection),
          ...normalizeObject(decision.overrides.confirmed_reflection)
        }
      : normalizeObject(candidate.proposed_reflection);

    if (status === "accepted" || status === "edited") {
      hintsToAdd.push(buildHintFromReflection({
        candidate,
        confirmedReflection,
        processedAt
      }));
    }

    return {
      ...candidate,
      review_status: status,
      reviewed_at: processedAt,
      reviewed_by: normalizeString(payload.operator) || "user",
      confirmed_reflection: status === "rejected" ? null : confirmedReflection,
      review_notes: normalizeString(decision.notes)
    };
  });

  const nextHints = mergeHints(store.hints, hintsToAdd);
  const write = writeMemoryStore({
    storePath: memoryStorePath,
    store: {
      ...store,
      reflection_candidates: reflectionCandidates,
      hints: nextHints
    },
    processedAt
  });

  return {
    status: "success",
    memory_store_path: write.store_path,
    memory_store_delta: {
      reflection_candidates_reviewed: decisions.size,
      hints_added: countNewHints(store.hints, hintsToAdd)
    }
  };
}

export function getMemoryHints({ memory_store_path: memoryStorePathAlias, store_path: storePathAlias, scope = "", limit = 10 } = {}) {
  const memoryStorePath = normalizeString(memoryStorePathAlias || storePathAlias);
  if (!memoryStorePath) {
    throw new Error("getMemoryHints requires memory_store_path.");
  }

  const store = loadMemoryStore({ storePath: memoryStorePath });
  const targetScope = normalizeString(scope);
  const maxHints = clampInteger(limit, 10, 1, 50);
  const hints = normalizeArray(store.hints)
    .filter((hint) => normalizeString(hint.status) === "active")
    .filter((hint) => !targetScope || normalizeString(hint.scope) === targetScope)
    .slice(0, maxHints)
    .map((hint) => ({
      hint_id: normalizeString(hint.hint_id),
      reflection_id: normalizeString(hint.reflection_id),
      scope: normalizeString(hint.scope),
      hint_text: normalizeString(hint.hint_text),
      created_at: normalizeString(hint.created_at)
    }));

  return {
    status: "success",
    memory_store_path: store.store_path,
    scope: targetScope,
    hint_count: hints.length,
    hints
  };
}

export function getMemoryFeedbackReport({ memory_store_path: memoryStorePathAlias, store_path: storePathAlias } = {}) {
  const memoryStorePath = normalizeString(memoryStorePathAlias || storePathAlias);
  if (!memoryStorePath) {
    throw new Error("getMemoryFeedbackReport requires memory_store_path.");
  }

  const store = loadMemoryStore({ storePath: memoryStorePath });
  const feedbackEvents = normalizeArray(store.feedback_events);
  const reviewDiffs = normalizeArray(store.review_diffs);
  const facts = normalizeArray(store.facts);

  return {
    status: "success",
    memory_store_path: store.store_path,
    feedback_event_count: feedbackEvents.length,
    feedback_type_counts: countBy(feedbackEvents, (event) => normalizeFeedbackType(event.feedback_type)),
    fact_quality_summary: {
      facts_marked_useful: facts.filter((fact) => Number(normalizeObject(fact.quality).user_marked_useful_count || 0) > 0).length,
      facts_marked_wrong: facts.filter((fact) => Number(normalizeObject(fact.quality).user_marked_wrong_count || 0) > 0).length
    },
    review_diff_summary: buildReviewDiffSummary(reviewDiffs),
    reflection_summary: {
      pending: normalizeArray(store.reflection_candidates).filter((item) => normalizeString(item.review_status) === "pending").length,
      accepted: normalizeArray(store.reflection_candidates).filter((item) => normalizeString(item.review_status) === "accepted").length,
      edited: normalizeArray(store.reflection_candidates).filter((item) => normalizeString(item.review_status) === "edited").length,
      rejected: normalizeArray(store.reflection_candidates).filter((item) => normalizeString(item.review_status) === "rejected").length
    },
    hint_count: normalizeArray(store.hints).filter((hint) => normalizeString(hint.status) === "active").length
  };
}

function buildReflectionCandidate({ proposedReflection, feedbackId, processedAt }) {
  const reflection = normalizeObject(proposedReflection);
  if (!Object.keys(reflection).length) {
    return null;
  }
  return {
    reflection_id: stableMemoryId("reflection", [
      feedbackId,
      reflection.error_type,
      reflection.wrong_assumption,
      reflection.better_rule,
      reflection.scope
    ]),
    feedback_id: feedbackId,
    review_status: "pending",
    created_at: processedAt,
    reviewed_at: "",
    reviewed_by: "",
    proposed_reflection: reflection,
    confirmed_reflection: null
  };
}

function updateFactQuality({ facts, targetType, targetId, feedbackType }) {
  if (targetType !== "fact" || !targetId) {
    return normalizeArray(facts);
  }
  return normalizeArray(facts).map((fact) => {
    if (normalizeString(fact.fact_id) !== targetId) {
      return fact;
    }
    const quality = normalizeObject(fact.quality);
    return {
      ...fact,
      quality: {
        ...quality,
        retrieval_count: Number(quality.retrieval_count || 0),
        last_retrieved_at: quality.last_retrieved_at ?? null,
        user_marked_useful_count: Number(quality.user_marked_useful_count || 0) + (feedbackType === "useful" ? 1 : 0),
        user_marked_wrong_count: Number(quality.user_marked_wrong_count || 0) + (["wrong", "stale"].includes(feedbackType) ? 1 : 0)
      }
    };
  });
}

function normalizeReflectionDecision(decision) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return null;
  }
  return {
    reflection_id: normalizeString(decision.reflection_id),
    decision: normalizeDecision(decision.decision || decision.final_action),
    overrides: normalizeObject(decision.overrides),
    notes: normalizeString(decision.notes || decision.note)
  };
}

function buildHintFromReflection({ candidate, confirmedReflection, processedAt }) {
  const scope = normalizeString(confirmedReflection.scope) || "global";
  const hintText = normalizeString(
    confirmedReflection.better_rule
    || confirmedReflection.derived_hint
    || confirmedReflection.user_note
    || confirmedReflection.wrong_assumption
  );
  return {
    hint_id: stableMemoryId("hint", [
      candidate.reflection_id,
      scope,
      hintText
    ]),
    reflection_id: normalizeString(candidate.reflection_id),
    scope,
    hint_text: hintText,
    created_at: processedAt,
    status: "active",
    usage_count: 0,
    last_used_at: null
  };
}

function mergeHints(existingHints, incomingHints) {
  const map = new Map(normalizeArray(existingHints).map((hint) => [hint.hint_id, hint]));
  for (const hint of normalizeArray(incomingHints)) {
    if (hint.hint_id && !map.has(hint.hint_id)) {
      map.set(hint.hint_id, hint);
    }
  }
  return Array.from(map.values());
}

function buildReviewDiffSummary(reviewDiffs) {
  const summary = {
    total_review_diffs: reviewDiffs.length,
    candidate_count: 0,
    accepted_count: 0,
    edited_count: 0,
    rejected_or_deferred_count: 0,
    field_actions: {}
  };

  for (const diff of reviewDiffs) {
    summary.candidate_count += Number(diff.candidate_count || 0);
    summary.accepted_count += Number(diff.accepted_count || 0);
    summary.edited_count += Number(diff.edited_count || 0);
    summary.rejected_or_deferred_count += Number(diff.rejected_or_deferred_count || 0);
    for (const fieldDiff of normalizeArray(diff.field_diffs)) {
      const field = normalizeString(fieldDiff.field) || "unknown";
      const action = normalizeString(fieldDiff.action) || "unknown";
      summary.field_actions[field] = {
        ...(summary.field_actions[field] || {}),
        [action]: Number(summary.field_actions[field]?.[action] || 0) + 1
      };
    }
  }

  return summary;
}

function countBy(values, getKey) {
  const counts = {};
  for (const value of normalizeArray(values)) {
    const key = normalizeString(getKey(value)) || "unknown";
    counts[key] = Number(counts[key] || 0) + 1;
  }
  return counts;
}

function countNewHints(existingHints, incomingHints) {
  const existingIds = new Set(normalizeArray(existingHints).map((hint) => normalizeString(hint.hint_id)));
  return normalizeArray(incomingHints).filter((hint) => hint.hint_id && !existingIds.has(hint.hint_id)).length;
}

function reflectionStatusForDecision(decision) {
  if (decision === "accepted") return "accepted";
  if (decision === "edited") return "edited";
  if (decision === "rejected") return "rejected";
  return "pending";
}

function normalizeFeedbackType(value) {
  const normalized = normalizeString(value);
  return ["useful", "wrong", "stale", "missing", "needs_merge", "other"].includes(normalized) ? normalized : "other";
}

function normalizeTargetType(value) {
  const normalized = normalizeString(value);
  return ["fact", "artifact", "review_diff", "briefing", "graph", "view"].includes(normalized) ? normalized : "artifact";
}

function normalizeDecision(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (["accepted", "accept", "confirm", "confirmed"].includes(normalized)) return "accepted";
  if (["edited", "edit", "modify", "modified"].includes(normalized)) return "edited";
  if (["rejected", "reject", "ignore"].includes(normalized)) return "rejected";
  return "deferred";
}

function normalizeStringArray(value) {
  return normalizeArray(value).map((item) => normalizeString(item)).filter(Boolean);
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
