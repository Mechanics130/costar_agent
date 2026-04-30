// SPDX-License-Identifier: Apache-2.0
import { stableMemoryId } from "./memory-ids.mjs";
import { loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";

export function commitMemoryReviewDecisions(payload = {}) {
  const memoryStorePath = normalizeString(payload.memory_store_path || payload.store_path);
  if (!memoryStorePath) {
    throw new Error("memory_review commit_request requires memory_store_path.");
  }

  const processedAt = new Date().toISOString();
  const store = loadMemoryStore({ storePath: memoryStorePath });
  const sourceRefs = normalizeArray(payload.source_refs).map(normalizeSourceRef).filter(Boolean);
  const candidates = normalizeArray(payload.candidates).map(normalizeCandidate).filter(Boolean);
  const decisions = new Map(
    normalizeArray(payload.review_decisions)
      .map(normalizeReviewDecision)
      .filter((decision) => decision.candidate_id)
      .map((decision) => [decision.candidate_id, decision])
  );

  const next = {
    ...store,
    sources: mergeById(store.sources, sourceRefs, "source_id"),
    entities: [...store.entities],
    candidates: mergeById(store.candidates, candidates.map((candidate) => applyCandidateDecision(candidate, decisions.get(candidate.candidate_id))), "candidate_id"),
    facts: [...store.facts]
  };

  const delta = {
    sources_added: countNewById(store.sources, sourceRefs, "source_id"),
    entities_added: 0,
    facts_added: 0,
    candidates_accepted: 0,
    candidates_edited: 0,
    candidates_rejected_or_deferred: 0
  };

  for (const candidate of candidates) {
    const decision = decisions.get(candidate.candidate_id);
    if (!decision) {
      continue;
    }
    if (decision.decision === "rejected" || decision.decision === "deferred") {
      delta.candidates_rejected_or_deferred += 1;
      continue;
    }

    if (decision.decision === "accepted") {
      delta.candidates_accepted += 1;
    } else {
      delta.candidates_edited += 1;
    }

    if (candidate.candidate_type === "entity") {
      const added = ensureEntity(next.entities, candidate, decision, processedAt);
      if (added) delta.entities_added += 1;
      continue;
    }

    if (candidate.candidate_type === "fact") {
      const entityAdded = ensureEntity(next.entities, candidate, decision, processedAt);
      if (entityAdded) delta.entities_added += 1;
      const fact = buildFact(candidate, decision, processedAt, payload.operator);
      if (!next.facts.some((item) => item.fact_id === fact.fact_id)) {
        next.facts.push(fact);
        delta.facts_added += 1;
      }
    }
  }

  const write = writeMemoryStore({
    storePath: memoryStorePath,
    store: next,
    processedAt
  });

  return {
    status: "success",
    memory_store_path: write.store_path,
    memory_store_delta: delta,
    committed_records: {
      sources: delta.sources_added,
      entities: delta.entities_added,
      facts: delta.facts_added
    },
    user_feedback: {
      summary: `Committed ${delta.facts_added} memory fact(s). Deferred or rejected ${delta.candidates_rejected_or_deferred} candidate(s).`
    }
  };
}

function ensureEntity(entities, candidate, decision, processedAt) {
  const proposedValue = mergeProposedValue(candidate, decision);
  const targetHint = mergeTargetHint(candidate, decision);
  const canonicalName = normalizeString(
    proposedValue.canonical_name
    || targetHint.name
    || targetHint.person_name
    || "Unknown person"
  );
  const entityId = normalizeString(targetHint.person_ref || targetHint.entity_id)
    || stableMemoryId("ent_person", canonicalName);
  const existing = entities.find((entity) =>
    entity.entity_id === entityId
    || normalizeString(entity.canonical_name).toLowerCase() === canonicalName.toLowerCase()
  );
  if (existing) {
    existing.last_updated_at = processedAt;
    return false;
  }

  entities.push({
    entity_id: entityId,
    entity_type: normalizeString(proposedValue.entity_type) || "person",
    canonical_name: canonicalName,
    aliases: normalizeStringArray(proposedValue.aliases),
    key_attributes: {},
    first_seen_at: processedAt,
    last_updated_at: processedAt,
    status: normalizeString(proposedValue.status) || "active",
    merged_into: null
  });
  return true;
}

function buildFact(candidate, decision, processedAt, operator) {
  const proposedValue = mergeProposedValue(candidate, decision);
  const targetHint = mergeTargetHint(candidate, decision);
  const entityName = normalizeString(targetHint.name || targetHint.person_name || proposedValue.entity_name || "Unknown person");
  const entityId = normalizeString(targetHint.person_ref || targetHint.entity_id) || stableMemoryId("ent_person", entityName);
  const factType = normalizeFactType(proposedValue.fact_type);
  const value = normalizeString(proposedValue.value);
  const confidence = normalizeConfidence(decision.overrides?.confidence || candidate.confidence);
  return {
    fact_id: stableMemoryId("fact", [entityId, factType, value]),
    entity_id: entityId,
    fact_type: factType,
    value,
    confidence,
    source_id: normalizeString(decision.overrides?.source_id || candidate.source_id),
    source_excerpt: normalizeString(decision.overrides?.source_excerpt || candidate.source_excerpt),
    date_observed: normalizeString(proposedValue.date_observed),
    date_committed: processedAt,
    status: "active",
    superseded_by: null,
    review: {
      reviewed_by: normalizeString(operator) || "user",
      reviewed_at: processedAt,
      decision: decision.decision,
      notes: normalizeString(decision.notes)
    },
    quality: {
      retrieval_count: 0,
      last_retrieved_at: null,
      user_marked_useful_count: 0,
      user_marked_wrong_count: 0
    }
  };
}

function applyCandidateDecision(candidate, decision) {
  if (!decision) {
    return candidate;
  }
  return {
    ...candidate,
    review_status: candidateReviewStatus(decision.decision)
  };
}

function candidateReviewStatus(decision) {
  if (decision === "accepted") return "accepted";
  if (decision === "edited") return "edited";
  if (decision === "rejected") return "rejected";
  return "pending";
}

function mergeProposedValue(candidate, decision) {
  return {
    ...normalizeObject(candidate.proposed_value),
    ...normalizeObject(decision.overrides?.proposed_value)
  };
}

function mergeTargetHint(candidate, decision) {
  return {
    ...normalizeObject(candidate.target_entity_hint),
    ...normalizeObject(decision.overrides?.target_entity_hint)
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const candidateId = normalizeString(candidate.candidate_id);
  if (!candidateId) return null;
  return {
    candidate_id: candidateId,
    candidate_type: normalizeString(candidate.candidate_type),
    suggested_action: normalizeString(candidate.suggested_action),
    target_entity_hint: normalizeObject(candidate.target_entity_hint),
    proposed_value: normalizeObject(candidate.proposed_value),
    confidence: normalizeConfidence(candidate.confidence),
    source_id: normalizeString(candidate.source_id),
    source_excerpt: normalizeString(candidate.source_excerpt),
    review_status: normalizeString(candidate.review_status) || "pending"
  };
}

function normalizeReviewDecision(decision) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
    return null;
  }
  return {
    candidate_id: normalizeString(decision.candidate_id),
    decision: normalizeDecision(decision.decision || decision.final_action),
    overrides: normalizeObject(decision.overrides),
    notes: normalizeString(decision.notes || decision.note)
  };
}

function normalizeSourceRef(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const sourceId = normalizeString(source.source_id);
  if (!sourceId) return null;
  return {
    source_id: sourceId,
    source_type: normalizeString(source.source_type) || "unknown",
    source_title: normalizeString(source.source_title) || "Untitled source",
    source_date: normalizeString(source.source_date),
    ingested_at: normalizeString(source.ingested_at) || new Date().toISOString(),
    ingested_by: normalizeString(source.ingested_by),
    hash: normalizeString(source.hash),
    size: Number.isInteger(Number(source.size)) ? Number(source.size) : 0,
    privacy_level: ["normal", "sensitive"].includes(normalizeString(source.privacy_level)) ? normalizeString(source.privacy_level) : "normal",
    retention_policy: ["metadata_only", "excerpt_only", "full_text_local"].includes(normalizeString(source.retention_policy))
      ? normalizeString(source.retention_policy)
      : "metadata_only"
  };
}

function mergeById(left, right, key) {
  const map = new Map(normalizeArray(left).map((item) => [item[key], item]));
  for (const item of normalizeArray(right)) {
    map.set(item[key], { ...(map.get(item[key]) || {}), ...item });
  }
  return Array.from(map.values());
}

function countNewById(existing, incoming, key) {
  const existingIds = new Set(normalizeArray(existing).map((item) => item?.[key]));
  return normalizeArray(incoming).filter((item) => item?.[key] && !existingIds.has(item[key])).length;
}

function normalizeFactType(value) {
  const normalized = normalizeString(value);
  return [
    "role",
    "preference",
    "concern",
    "style",
    "constraint",
    "commitment",
    "history",
    "need",
    "issue",
    "attitude_intent"
  ].includes(normalized) ? normalized : "history";
}

function normalizeConfidence(value) {
  const normalized = normalizeString(value);
  return ["confirmed", "inferred", "speculative"].includes(normalized) ? normalized : "inferred";
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
