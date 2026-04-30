// SPDX-License-Identifier: Apache-2.0
import { stableMemoryId } from "./memory-ids.mjs";

const FACT_FIELD_MAP = [
  ["summary", "history"],
  ["current_judgment", "history"],
  ["intent", "attitude_intent"],
  ["preferences", "preference"],
  ["boundaries", "constraint"],
  ["risk_flags", "concern"]
];

export function buildMemoryCandidatesFromIngestion(payload = {}) {
  const sourceRefs = createSourceRefs(payload);
  const profiles = Array.isArray(payload.person_profiles) ? payload.person_profiles : [];
  const candidates = [];

  profiles.forEach((profile, index) => {
    const personName = normalizeString(profile?.person_name);
    if (!personName) return;
    const evidence = pickProfileEvidence(profile, payload);
    const sourceId = pickProfileSourceId(profile, sourceRefs, payload);
    const base = {
      target_entity_hint: buildTargetEntityHint(profile),
      source_id: sourceId,
      source_excerpt: evidence || "Source evidence pending user review.",
      review_status: "pending"
    };
    candidates.push(buildEntityCandidate(profile, base, index));
    candidates.push(...buildFactCandidates(profile, base));
  });

  return {
    status: "success",
    source_refs: sourceRefs,
    candidates
  };
}

export function createSourceRefs(payload = {}) {
  const manifests = [
    ...normalizeArray(payload.source_manifest),
    ...normalizeArray(payload.sources)
  ];
  const evidenceSources = normalizeArray(payload.evidence).map((item) => ({
    source_id: item.source_id,
    source_title: item.source_title,
    relative_path: item.source_relative_path,
    captured_at: item.source_captured_at,
    source_type: item.source_type
  }));
  const seen = new Map();
  [...manifests, ...evidenceSources].forEach((source, index) => {
    if (!source || typeof source !== "object") return;
    const sourceId = normalizeString(source.source_id || source.id) || `src_${index + 1}`;
    if (seen.has(sourceId)) return;
    seen.set(sourceId, {
      source_id: sourceId,
      source_type: normalizeString(source.source_type || source.type) || "unknown",
      source_title: normalizeString(source.source_title || source.title || source.name) || "Untitled source",
      source_date: normalizeString(source.source_date || source.date || source.captured_at || source.created_at || source.updated_at),
      ingested_at: normalizeString(source.ingested_at || source.captured_at || source.created_at || source.updated_at),
      ingested_by: normalizeString(source.ingested_by),
      hash: normalizeString(source.hash),
      size: normalizeInteger(source.size),
      privacy_level: normalizePrivacyLevel(source.privacy_level),
      retention_policy: normalizeRetentionPolicy(source.retention_policy)
    });
  });
  return Array.from(seen.values());
}

export function normalizeCandidateConfidence(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (["confirmed", "high", "strong", "certain"].includes(normalized)) return "confirmed";
  if (["speculative", "low", "weak", "uncertain"].includes(normalized)) return "speculative";
  return "inferred";
}

function buildEntityCandidate(profile, base, index) {
  const personName = normalizeString(profile.person_name);
  const action = normalizeSuggestedAction(profile.resolution_action);
  return {
    candidate_id: stableMemoryId("cand_entity", [personName, action, index + 1]),
    candidate_type: "entity",
    suggested_action: action,
    target_entity_hint: base.target_entity_hint,
    proposed_value: {
      entity_type: "person",
      canonical_name: personName,
      aliases: normalizeArray(profile.aliases).map((item) => normalizeString(item)).filter(Boolean),
      status: "active"
    },
    confidence: normalizeCandidateConfidence(profile.confidence),
    source_id: base.source_id,
    source_excerpt: base.source_excerpt,
    review_status: base.review_status
  };
}

function buildFactCandidates(profile, base) {
  const compiledTruth = profile.compiled_truth && typeof profile.compiled_truth === "object"
    ? profile.compiled_truth
    : {};
  const facts = [];
  for (const [field, factType] of FACT_FIELD_MAP) {
    for (const value of normalizeFactValues(compiledTruth[field])) {
      facts.push(buildFactCandidate({ profile, base, field, factType, value, confidence: profile.confidence }));
    }
  }
  facts.push(...buildLatentNeedCandidates(profile, base, compiledTruth.latent_needs));
  return facts;
}

function buildLatentNeedCandidates(profile, base, latentNeeds) {
  const needItems = [
    ...normalizeArray(latentNeeds?.counterpart),
    ...normalizeArray(latentNeeds?.self),
    ...normalizeArray(latentNeeds)
  ];
  return needItems
    .map((item) => normalizeLatentNeed(item))
    .filter((item) => item.value)
    .map((item) => buildFactCandidate({
      profile,
      base: {
        ...base,
        source_excerpt: item.evidence || base.source_excerpt
      },
      field: "compiled_truth.latent_needs",
      factType: "need",
      value: item.value,
      confidence: item.confidence || "low"
    }));
}

function buildFactCandidate({ profile, base, field, factType, value, confidence }) {
  const personName = normalizeString(profile.person_name);
  return {
    candidate_id: stableMemoryId("cand_fact", [personName, factType, value]),
    candidate_type: "fact",
    suggested_action: "create_new",
    target_entity_hint: base.target_entity_hint,
    proposed_value: {
      fact_type: factType,
      field,
      value
    },
    confidence: normalizeCandidateConfidence(confidence),
    source_id: base.source_id,
    source_excerpt: base.source_excerpt,
    review_status: base.review_status
  };
}

function buildTargetEntityHint(profile) {
  const personName = normalizeString(profile.person_name);
  return {
    name: personName,
    person_ref: normalizeString(profile.person_ref || profile.person_id) || personName,
    resolution_action: normalizeString(profile.resolution_action),
    matched_existing_person_id: normalizeString(profile.linked_relationships?.matched_existing_person_id)
      || normalizeString(profile.matched_existing_person_id)
  };
}

function pickProfileEvidence(profile, payload) {
  const directEvidence = [
    ...normalizeArray(profile.evidence_summary?.key_evidence),
    ...normalizeArray(profile.evidence)
  ].map((item) => normalizeString(item)).find(Boolean);
  if (directEvidence) return directEvidence;

  const profileName = normalizeString(profile.person_name);
  const detected = normalizeArray(payload.detected_people).find((item) => normalizeString(item.person_name) === profileName);
  return normalizeArray(detected?.evidence).map((item) => normalizeString(item)).find(Boolean) || "";
}

function pickProfileSourceId(profile, sourceRefs, payload) {
  const timelineSource = normalizeArray(profile.timeline)
    .map((item) => normalizeString(item.source_id))
    .find(Boolean);
  if (timelineSource) return timelineSource;

  const profileName = normalizeString(profile.person_name);
  const detected = normalizeArray(payload.detected_people).find((item) => normalizeString(item.person_name) === profileName);
  const detectedSource = normalizeArray(detected?.matched_source_ids)
    .map((item) => normalizeString(item))
    .find(Boolean);
  return detectedSource || sourceRefs[0]?.source_id || "src_unknown";
}

function normalizeFactValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  if (value && typeof value === "object") {
    const label = normalizeString(value.label);
    const reason = normalizeString(value.reason);
    return [label && reason ? `${label}: ${reason}` : label || reason].filter(Boolean);
  }
  return [normalizeString(value)].filter(Boolean);
}

function normalizeLatentNeed(item) {
  if (typeof item === "string") {
    return { value: normalizeString(item), evidence: "", confidence: "low" };
  }
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { value: "", evidence: "", confidence: "low" };
  }
  return {
    value: normalizeString(item.need || item.value || item.summary),
    evidence: normalizeArray(item.evidence).map((entry) => normalizeString(entry)).find(Boolean) || normalizeString(item.source_excerpt),
    confidence: normalizeString(item.confidence) || "low"
  };
}

function normalizeSuggestedAction(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (["create", "create_new", "new"].includes(normalized)) return "create_new";
  if (["reject", "skip"].includes(normalized)) return "reject";
  if (["conflict", "conflict_with_existing"].includes(normalized)) return "conflict_with_existing";
  return "update_existing";
}

function normalizePrivacyLevel(value) {
  const normalized = normalizeString(value);
  return ["normal", "sensitive"].includes(normalized) ? normalized : "normal";
}

function normalizeRetentionPolicy(value) {
  const normalized = normalizeString(value);
  return ["metadata_only", "excerpt_only", "full_text_local"].includes(normalized)
    ? normalized
    : "metadata_only";
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value) {
  return String(value ?? "").trim();
}
