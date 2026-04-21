// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { __internal } from "./relationship-ingestion.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const storesDir = path.join(__dirname, "stores");
const defaultStorePath = path.join(storesDir, "relationship-profile-store.json");

const SKILL_NAME = "relationship-review-resolution";
const SKILL_VERSION = "0.1.0";
const DEFAULT_OPTIONS = {
  write_store: true,
  auto_commit_safe_updates: true
};
const PROFILE_TIER_ORDER = {
  stub: 1,
  active: 2,
  key: 3,
  archived: 0
};
const CONFIDENCE_ORDER = {
  low: 1,
  medium: 2,
  high: 3
};

export function getRelationshipReviewResolutionSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    default_store_path: defaultStorePath
  };
}

export function runRelationshipReviewResolution(payload) {
  const request = validateReviewResolutionRequest(payload);
  const processedAt = new Date().toISOString();
  const storePath = request.profile_store_path || defaultStorePath;
  const store = loadProfileStore(storePath);
  const baseProfiles = Array.isArray(request.existing_profiles) && request.existing_profiles.length
    ? request.existing_profiles.map((profile) => normalizeRelationshipProfile(profile))
    : store.profiles;

  const context = buildIngestionContext(request.ingestion_result);
  const decisionsMap = buildDecisionsMap(request.review_decisions);
  const results = {
    committedProfiles: [],
    createdPeople: [],
    updatedPeople: [],
    ignoredPeople: [],
    deferredPeople: [],
    unresolvedCandidates: [],
    autoCommittedPeople: []
  };

  context.orderedCandidates.forEach((candidate) => {
    const key = buildCandidateKey(candidate.person_name);
    const baseProfile = buildBaseProfile(candidate, context);
    const decision = decisionsMap.get(key);
    const safeAutoCommit = shouldAutoCommitCandidate(candidate, baseProfile, request.options);

    if (decision) {
      applyDecision({
        candidate,
        baseProfile,
        decision,
        processedAt,
        results
      });
      return;
    }

    if (safeAutoCommit) {
      const autoProfile = finalizeCommittedProfile({
        profile: baseProfile,
        finalAction: "update",
        processedAt,
        origin: "auto"
      });
      results.committedProfiles.push(autoProfile);
      results.updatedPeople.push(buildCommittedRecord(autoProfile, "auto"));
      results.autoCommittedPeople.push(autoProfile.person_name);
      return;
    }

    if (candidate.needs_confirmation) {
      results.unresolvedCandidates.push(buildUnresolvedRecord(candidate));
      return;
    }

    if (baseProfile.resolution_action === "ignore") {
      results.ignoredPeople.push({
        person_name: baseProfile.person_name,
        reason: "候选信息被判定为噪音或无需沉淀",
        source: "auto"
      });
      return;
    }

    results.unresolvedCandidates.push(buildUnresolvedRecord(candidate));
  });

  const mergedStoreProfiles = mergeProfilesIntoStore(baseProfiles, results.committedProfiles, processedAt);
  const storeWrite = request.options.write_store
    ? writeProfileStore(storePath, mergedStoreProfiles, processedAt)
    : {
        store_path: storePath,
        written: false,
        profile_count: mergedStoreProfiles.length,
        updated_at: processedAt
      };

  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    status: results.unresolvedCandidates.length ? "needs_review" : "success",
    ingestion_skill: request.ingestion_result.skill || "relationship-ingestion",
    processed_at: processedAt,
    review_summary: {
      decision_count: request.review_decisions.length,
      committed_count: results.committedProfiles.length,
      created_count: results.createdPeople.length,
      updated_count: results.updatedPeople.length,
      ignored_count: results.ignoredPeople.length,
      deferred_count: results.deferredPeople.length,
      unresolved_count: results.unresolvedCandidates.length,
      auto_committed_count: results.autoCommittedPeople.length
    },
    committed_profiles: results.committedProfiles,
    created_people: results.createdPeople,
    updated_people: results.updatedPeople,
    ignored_people: results.ignoredPeople,
    deferred_people: results.deferredPeople,
    unresolved_candidates: results.unresolvedCandidates,
    profile_store_delta: {
      upserts: results.committedProfiles,
      ignored_people: results.ignoredPeople,
      deferred_people: results.deferredPeople,
      auto_committed_people: results.autoCommittedPeople,
      store_path: storeWrite.store_path,
      written: storeWrite.written,
      total_profiles_after_write: storeWrite.profile_count
    },
    notes: request.notes || ""
  };
}

function validateReviewResolutionRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("review request 必须是对象");
  }

  const ingestionResult = payload.ingestion_result;
  if (!ingestionResult || typeof ingestionResult !== "object") {
    throw new Error("缺少 ingestion_result");
  }
  if (ingestionResult.skill !== "relationship-ingestion") {
    throw new Error("ingestion_result.skill 必须是 relationship-ingestion");
  }

  const reviewDecisions = Array.isArray(payload.review_decisions) ? payload.review_decisions : [];
  const existingProfiles = Array.isArray(payload.existing_profiles) ? payload.existing_profiles : [];
  const options = {
    ...DEFAULT_OPTIONS,
    ...(payload.options && typeof payload.options === "object" ? payload.options : {})
  };

  reviewDecisions.forEach((decision, index) => {
    if (!decision || typeof decision !== "object") {
      throw new Error(`review_decisions[${index}] 必须是对象`);
    }
    if (!String(decision.person_name || "").trim()) {
      throw new Error(`review_decisions[${index}] 缺少 person_name`);
    }
    if (!["create", "update", "ignore", "defer"].includes(String(decision.final_action || ""))) {
      throw new Error(`review_decisions[${index}] final_action 非法`);
    }
  });

  return {
    skill: String(payload.skill || SKILL_NAME),
    version: String(payload.version || SKILL_VERSION),
    ingestion_result: ingestionResult,
    review_decisions: reviewDecisions,
    existing_profiles: existingProfiles,
    profile_store_path: String(payload.profile_store_path || "").trim() || null,
    operator: String(payload.operator || "").trim(),
    notes: String(payload.notes || "").trim(),
    options
  };
}

function buildIngestionContext(ingestionResult) {
  const personProfiles = Array.isArray(ingestionResult.person_profiles)
    ? ingestionResult.person_profiles.map((profile) => normalizeRelationshipProfile(profile))
    : [];
  const resolvedPeople = Array.isArray(ingestionResult.resolved_people) ? ingestionResult.resolved_people : [];
  const profileUpdates = Array.isArray(ingestionResult.profile_updates) ? ingestionResult.profile_updates : [];
  const reviewBundle = ingestionResult.review_bundle && typeof ingestionResult.review_bundle === "object"
    ? ingestionResult.review_bundle
    : { candidates: [] };

  const profilesByKey = new Map();
  personProfiles.forEach((profile) => {
    profilesByKey.set(buildCandidateKey(profile.person_name), profile);
  });

  const resolvedByKey = new Map();
  resolvedPeople.forEach((person) => {
    resolvedByKey.set(buildCandidateKey(person.person_name), person);
  });

  const profileUpdatesByKey = new Map();
  profileUpdates.forEach((update) => {
    profileUpdatesByKey.set(buildCandidateKey(update.person_name), update);
  });

  const orderedCandidates = [];
  const pushed = new Set();
  personProfiles.forEach((profile) => {
    const key = buildCandidateKey(profile.person_name);
    if (pushed.has(key)) {
      return;
    }
    pushed.add(key);
    orderedCandidates.push({
      person_name: profile.person_name,
      suggested_action: profile.resolution_action,
      confidence: profile.confidence,
      needs_confirmation: profile.resolution_action === "create",
      source: "person_profile"
    });
  });

  const bundleCandidates = Array.isArray(reviewBundle.candidates) ? reviewBundle.candidates : [];
  bundleCandidates.forEach((candidate) => {
    const key = buildCandidateKey(candidate.person_name);
    if (!pushed.has(key)) {
      pushed.add(key);
      orderedCandidates.push(candidate);
    }
  });

  return {
    personProfiles,
    profilesByKey,
    resolvedByKey,
    profileUpdatesByKey,
    reviewBundle,
    orderedCandidates
  };
}

function buildBaseProfile(candidate, context) {
  const key = buildCandidateKey(candidate.person_name);
  const existingProfile = context.profilesByKey.get(key);
  if (existingProfile) {
    return clone(existingProfile);
  }

  const profileUpdate = context.profileUpdatesByKey.get(key);
  const resolved = context.resolvedByKey.get(key);
  return synthesizeProfile(candidate, profileUpdate, resolved);
}

function synthesizeProfile(candidate, profileUpdate, resolved) {
  const tags = deriveFieldArray(candidate, profileUpdate, "compiled_truth.tags", "tags");
  const traits = deriveFieldArray(candidate, profileUpdate, "compiled_truth.traits", "traits");
  const preferences = deriveFieldArray(candidate, profileUpdate, "compiled_truth.preferences", "preferences");
  const boundaries = deriveFieldArray(candidate, profileUpdate, "compiled_truth.boundaries", "boundaries");
  const riskFlags = deriveFieldArray(candidate, profileUpdate, "compiled_truth.risk_flags", "risk_flags");
  const nextActions = deriveFieldArray(candidate, profileUpdate, "compiled_truth.next_actions", "next_actions");
  const openQuestions = normalizeStringArray([
    ...(Array.isArray(candidate.questions) ? candidate.questions : []),
    ...(Array.isArray(profileUpdate?.open_questions) ? profileUpdate.open_questions : [])
  ]);
  const summary = deriveFieldValue(candidate, profileUpdate, "compiled_truth.summary", "summary")
    || "资料中提到了该人物，建议结合证据继续确认。";
  const intent = deriveFieldValue(candidate, profileUpdate, "compiled_truth.intent", "intent") || "待判断";
  const relationshipStage = deriveFieldValue(candidate, profileUpdate, "compiled_truth.relationship_stage", "relationship_stage") || "待判断";
  const attitude = profileUpdate?.attitude && typeof profileUpdate.attitude === "object"
    ? {
        label: String(profileUpdate.attitude.label || "待判断").trim(),
        reason: String(profileUpdate.attitude.reason || "").trim()
      }
    : {
        label: "待判断",
        reason: ""
      };
  const evidencePreview = normalizeStringArray([
    ...(Array.isArray(candidate.evidence_preview) ? candidate.evidence_preview : []),
    ...(Array.isArray(profileUpdate?.evidence) ? profileUpdate.evidence : [])
  ]);
  const resolutionAction = normalizeResolutionAction(
    profileUpdate?.resolution_action || resolved?.resolution_action || candidate.suggested_action || "review"
  );

  return normalizeRelationshipProfile({
    person_name: candidate.person_name,
    person_ref: candidate.person_name,
    resolution_action: resolutionAction === "review" ? "create" : resolutionAction,
    profile_tier: guessProfileTier(candidate, resolutionAction),
    confidence: normalizeConfidence(candidate.confidence || resolved?.confidence || "low"),
    aliases: [],
    compiled_truth: {
      summary,
      current_judgment: summary,
      relationship_stage: relationshipStage,
      intent,
      attitude,
      traits,
      tags,
      preferences,
      boundaries,
      risk_flags: riskFlags,
      open_questions: openQuestions,
      next_actions: nextActions
    },
    timeline: [],
    evidence_summary: {
      excerpt_count: evidencePreview.length,
      source_count: 0,
      last_updated_at: "",
      key_evidence: evidencePreview
    },
    linked_relationships: {
      detected_as: true,
      matched_existing_person_id: resolved?.matched_existing_person_id || null,
      matched_existing_person_name: resolved?.matched_existing_person_name || null
    }
  });
}

function applyDecision({ candidate, baseProfile, decision, processedAt, results }) {
  if (decision.final_action === "ignore") {
    results.ignoredPeople.push({
      person_name: baseProfile.person_name,
      reason: decision.notes || "用户确认忽略该人物",
      source: "review"
    });
    return;
  }

  if (decision.final_action === "defer") {
    results.deferredPeople.push({
      person_name: baseProfile.person_name,
      reason: decision.notes || "保留待后续确认",
      source: "review"
    });
    return;
  }

  const overriddenProfile = applyProfileDecision(baseProfile, candidate, decision);
  const committedProfile = finalizeCommittedProfile({
    profile: overriddenProfile,
    finalAction: decision.final_action,
    processedAt,
    origin: "review"
  });

  results.committedProfiles.push(committedProfile);
  if (decision.final_action === "create") {
    results.createdPeople.push(buildCommittedRecord(committedProfile, "review"));
  } else {
    results.updatedPeople.push(buildCommittedRecord(committedProfile, "review"));
  }
}

function applyProfileDecision(baseProfile, candidate, decision) {
  const profile = clone(baseProfile);
  const overrides = decision.overrides && typeof decision.overrides === "object" ? decision.overrides : {};

  if (decision.final_action === "create" && (!profile.person_ref || profile.person_ref === profile.person_name)) {
    profile.person_ref = decision.resolved_person_ref || buildPersonRef(profile.person_name);
  }

  if (decision.final_action === "update") {
    profile.person_ref = decision.resolved_person_ref
      || profile.linked_relationships.matched_existing_person_id
      || profile.person_ref
      || buildPersonRef(profile.person_name);
    profile.linked_relationships.matched_existing_person_id = profile.person_ref;
    profile.linked_relationships.matched_existing_person_name = decision.resolved_person_name || profile.person_name;
  }

  if (decision.resolved_person_name) {
    profile.person_name = String(decision.resolved_person_name).trim();
  }

  if (decision.profile_tier) {
    profile.profile_tier = normalizeProfileTier(decision.profile_tier);
  }

  profile.compiled_truth.summary = firstNonEmpty([
    overrides.summary,
    profile.compiled_truth.summary,
    deriveFieldValue(candidate, null, "compiled_truth.summary", "summary")
  ]);
  profile.compiled_truth.current_judgment = firstNonEmpty([
    overrides.current_judgment,
    profile.compiled_truth.current_judgment,
    profile.compiled_truth.summary
  ]);
  profile.compiled_truth.relationship_stage = firstNonEmpty([
    overrides.relationship_stage,
    profile.compiled_truth.relationship_stage
  ]);
  profile.compiled_truth.intent = firstNonEmpty([
    overrides.intent,
    profile.compiled_truth.intent
  ]);

  const overrideAttitude = overrides.attitude && typeof overrides.attitude === "object" ? overrides.attitude : null;
  profile.compiled_truth.attitude = {
    label: firstNonEmpty([overrideAttitude?.label, profile.compiled_truth.attitude?.label, "待判断"]),
    reason: firstNonEmpty([overrideAttitude?.reason, profile.compiled_truth.attitude?.reason, ""])
  };

  profile.compiled_truth.tags = resolveArrayOverride(overrides.tags, profile.compiled_truth.tags);
  profile.compiled_truth.traits = resolveArrayOverride(overrides.traits, profile.compiled_truth.traits);
  profile.compiled_truth.preferences = resolveArrayOverride(overrides.preferences, profile.compiled_truth.preferences);
  profile.compiled_truth.boundaries = resolveArrayOverride(overrides.boundaries, profile.compiled_truth.boundaries);
  profile.compiled_truth.risk_flags = resolveArrayOverride(overrides.risk_flags, profile.compiled_truth.risk_flags);
  profile.compiled_truth.open_questions = resolveArrayOverride(overrides.open_questions, profile.compiled_truth.open_questions);
  profile.compiled_truth.next_actions = resolveArrayOverride(overrides.next_actions, profile.compiled_truth.next_actions);

  if (Array.isArray(overrides.aliases)) {
    profile.aliases = normalizeStringArray([...profile.aliases, ...overrides.aliases]);
  }

  if (decision.notes) {
    profile.compiled_truth.open_questions = normalizeStringArray([
      ...profile.compiled_truth.open_questions,
      `用户备注：${decision.notes}`
    ]);
  }

  return profile;
}

function finalizeCommittedProfile({ profile, finalAction, processedAt, _origin }) {
  const committed = clone(profile);
  committed.resolution_action = normalizeResolutionAction(finalAction === "update" ? "update" : "create");
  committed.confidence = normalizeConfidence(committed.confidence || "medium");
  committed.profile_tier = normalizeProfileTier(committed.profile_tier || "active");
  committed.evidence_summary.last_updated_at = processedAt;
  committed.timeline = Array.isArray(committed.timeline) ? committed.timeline : [];
  committed.evidence_summary.excerpt_count = Array.isArray(committed.evidence_summary.key_evidence)
    ? committed.evidence_summary.key_evidence.length
    : 0;
  committed.linked_relationships.detected_as = true;
  committed.linked_relationships.matched_existing_person_name = committed.linked_relationships.matched_existing_person_name
    || committed.person_name;
  committed.compiled_truth.next_actions = normalizeStringArray(committed.compiled_truth.next_actions);
  committed.compiled_truth.open_questions = normalizeStringArray(committed.compiled_truth.open_questions);
  return committed;
}

function shouldAutoCommitCandidate(candidate, baseProfile, options) {
  if (!options.auto_commit_safe_updates) {
    return false;
  }
  if (candidate.needs_confirmation) {
    return false;
  }
  if (candidate.suggested_action !== "update") {
    return false;
  }
  return normalizeConfidence(baseProfile.confidence) !== "low";
}

function mergeProfilesIntoStore(existingProfiles, committedProfiles, processedAt) {
  const merged = new Map();

  existingProfiles.forEach((profile) => {
    const normalized = normalizeRelationshipProfile(profile);
    merged.set(buildProfileKey(normalized), normalized);
  });

  committedProfiles.forEach((profile) => {
    const key = buildProfileKey(profile);
    const previous = merged.get(key);
    merged.set(key, previous ? mergeProfile(previous, profile, processedAt) : normalizeRelationshipProfile(profile));
  });

  return Array.from(merged.values()).sort((left, right) => left.person_name.localeCompare(right.person_name, "zh-Hans-CN"));
}

function mergeProfile(previous, incoming, processedAt) {
  const merged = normalizeRelationshipProfile(previous);
  const normalizedIncoming = normalizeRelationshipProfile(incoming);

  merged.person_name = normalizedIncoming.person_name || merged.person_name;
  merged.person_ref = normalizedIncoming.person_ref || merged.person_ref;
  merged.resolution_action = normalizedIncoming.resolution_action || merged.resolution_action;
  merged.profile_tier = chooseProfileTier(merged.profile_tier, normalizedIncoming.profile_tier);
  merged.confidence = chooseConfidence(merged.confidence, normalizedIncoming.confidence);
  merged.aliases = normalizeStringArray([...merged.aliases, ...normalizedIncoming.aliases]);

  merged.compiled_truth.summary = normalizedIncoming.compiled_truth.summary || merged.compiled_truth.summary;
  merged.compiled_truth.current_judgment = normalizedIncoming.compiled_truth.current_judgment || merged.compiled_truth.current_judgment;
  merged.compiled_truth.relationship_stage = normalizedIncoming.compiled_truth.relationship_stage || merged.compiled_truth.relationship_stage;
  merged.compiled_truth.intent = normalizedIncoming.compiled_truth.intent || merged.compiled_truth.intent;
  merged.compiled_truth.attitude = {
    label: normalizedIncoming.compiled_truth.attitude?.label || merged.compiled_truth.attitude?.label || "待判断",
    reason: normalizedIncoming.compiled_truth.attitude?.reason || merged.compiled_truth.attitude?.reason || ""
  };
  merged.compiled_truth.tags = normalizeStringArray([...merged.compiled_truth.tags, ...normalizedIncoming.compiled_truth.tags]);
  merged.compiled_truth.traits = normalizeStringArray([...merged.compiled_truth.traits, ...normalizedIncoming.compiled_truth.traits]);
  merged.compiled_truth.preferences = normalizeStringArray([...merged.compiled_truth.preferences, ...normalizedIncoming.compiled_truth.preferences]);
  merged.compiled_truth.boundaries = normalizeStringArray([...merged.compiled_truth.boundaries, ...normalizedIncoming.compiled_truth.boundaries]);
  merged.compiled_truth.risk_flags = normalizeStringArray([...merged.compiled_truth.risk_flags, ...normalizedIncoming.compiled_truth.risk_flags]);
  merged.compiled_truth.open_questions = normalizeStringArray([...merged.compiled_truth.open_questions, ...normalizedIncoming.compiled_truth.open_questions]);
  merged.compiled_truth.next_actions = normalizeStringArray([...merged.compiled_truth.next_actions, ...normalizedIncoming.compiled_truth.next_actions]);

  const timelineMap = new Map();
  [...merged.timeline, ...normalizedIncoming.timeline].forEach((item) => {
    const key = `${item.source_id}::${item.matched_excerpt_index}::${item.event_summary}`;
    if (!timelineMap.has(key)) {
      timelineMap.set(key, item);
    }
  });
  merged.timeline = Array.from(timelineMap.values());

  merged.evidence_summary.key_evidence = normalizeStringArray([
    ...merged.evidence_summary.key_evidence,
    ...normalizedIncoming.evidence_summary.key_evidence
  ]);
  merged.evidence_summary.excerpt_count = merged.evidence_summary.key_evidence.length;
  merged.evidence_summary.source_count = new Set(merged.timeline.map((item) => item.source_id)).size;
  merged.evidence_summary.last_updated_at = processedAt;

  merged.linked_relationships.detected_as = merged.linked_relationships.detected_as || normalizedIncoming.linked_relationships.detected_as;
  merged.linked_relationships.matched_existing_person_id = normalizedIncoming.linked_relationships.matched_existing_person_id
    || merged.linked_relationships.matched_existing_person_id
    || merged.person_ref;
  merged.linked_relationships.matched_existing_person_name = normalizedIncoming.linked_relationships.matched_existing_person_name
    || merged.linked_relationships.matched_existing_person_name
    || merged.person_name;

  return merged;
}

function loadProfileStore(storePath) {
  if (!existsSync(storePath)) {
    return {
      version: SKILL_VERSION,
      updated_at: "",
      profiles: []
    };
  }

  const parsed = JSON.parse(readFileSync(storePath, "utf8"));
  return {
    version: String(parsed.version || SKILL_VERSION),
    updated_at: String(parsed.updated_at || ""),
    profiles: Array.isArray(parsed.profiles)
      ? parsed.profiles.map((profile) => normalizeRelationshipProfile(profile))
      : []
  };
}

function writeProfileStore(storePath, profiles, processedAt) {
  ensureDirectory(path.dirname(storePath));
  writeFileSync(
    storePath,
    `${JSON.stringify(
      {
        version: SKILL_VERSION,
        updated_at: processedAt,
        profiles
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return {
    store_path: storePath,
    written: true,
    profile_count: profiles.length,
    updated_at: processedAt
  };
}

function buildDecisionsMap(reviewDecisions) {
  const map = new Map();
  reviewDecisions.forEach((decision) => {
    map.set(buildCandidateKey(decision.person_name), {
      person_name: String(decision.person_name).trim(),
      final_action: String(decision.final_action).trim(),
      resolved_person_ref: String(decision.resolved_person_ref || "").trim() || null,
      resolved_person_name: String(decision.resolved_person_name || "").trim() || null,
      profile_tier: String(decision.profile_tier || "").trim() || null,
      notes: String(decision.notes || "").trim(),
      overrides: decision.overrides && typeof decision.overrides === "object" ? decision.overrides : {}
    });
  });
  return map;
}

function buildCommittedRecord(profile, source) {
  return {
    person_name: profile.person_name,
    person_ref: profile.person_ref,
    profile_tier: profile.profile_tier,
    source
  };
}

function buildUnresolvedRecord(candidate) {
  return {
    person_name: candidate.person_name,
    suggested_action: candidate.suggested_action || "review",
    confidence: normalizeConfidence(candidate.confidence || "low"),
    reason: candidate.questions?.[0] || "需要用户确认后再提交实体变更"
  };
}

function deriveFieldArray(candidate, profileUpdate, fieldName, fallbackKey) {
  const candidateValues = extractFieldCurrentValue(candidate, fieldName);
  const updateValues = Array.isArray(profileUpdate?.[fallbackKey]) ? profileUpdate[fallbackKey] : [];
  return normalizeStringArray([...(candidateValues || []), ...updateValues]);
}

function deriveFieldValue(candidate, profileUpdate, fieldName, fallbackKey) {
  const currentValue = extractFieldCurrentValue(candidate, fieldName);
  if (typeof currentValue === "string" && currentValue.trim()) {
    return currentValue.trim();
  }
  if (typeof profileUpdate?.[fallbackKey] === "string" && profileUpdate[fallbackKey].trim()) {
    return profileUpdate[fallbackKey].trim();
  }
  return "";
}

function extractFieldCurrentValue(candidate, fieldName) {
  const fields = Array.isArray(candidate?.fields_to_confirm) ? candidate.fields_to_confirm : [];
  const match = fields.find((field) => field?.field === fieldName);
  return match?.current_value;
}

function normalizeRelationshipProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new Error("relationship profile 必须是对象");
  }

  const personName = String(profile.person_name || "").trim();
  if (!personName) {
    throw new Error("relationship profile 缺少 person_name");
  }

  return {
    person_name: personName,
    person_ref: String(profile.person_ref || buildPersonRef(personName)).trim(),
    resolution_action: normalizeResolutionAction(profile.resolution_action || "create"),
    profile_tier: normalizeProfileTier(profile.profile_tier || "active"),
    confidence: normalizeConfidence(profile.confidence || "medium"),
    aliases: normalizeStringArray(profile.aliases),
    compiled_truth: {
      summary: firstNonEmpty([profile.compiled_truth?.summary, "待判断"]),
      current_judgment: firstNonEmpty([profile.compiled_truth?.current_judgment, profile.compiled_truth?.summary, "待判断"]),
      relationship_stage: firstNonEmpty([profile.compiled_truth?.relationship_stage, "待判断"]),
      intent: firstNonEmpty([profile.compiled_truth?.intent, "待判断"]),
      attitude: {
        label: firstNonEmpty([profile.compiled_truth?.attitude?.label, "待判断"]),
        reason: firstNonEmpty([profile.compiled_truth?.attitude?.reason, ""])
      },
      traits: normalizeStringArray(profile.compiled_truth?.traits),
      tags: normalizeStringArray(profile.compiled_truth?.tags),
      preferences: normalizeStringArray(profile.compiled_truth?.preferences),
      boundaries: normalizeStringArray(profile.compiled_truth?.boundaries),
      risk_flags: normalizeStringArray(profile.compiled_truth?.risk_flags),
      open_questions: normalizeStringArray(profile.compiled_truth?.open_questions),
      next_actions: normalizeStringArray(profile.compiled_truth?.next_actions)
    },
    timeline: Array.isArray(profile.timeline)
      ? profile.timeline.map((item, index) => ({
          timeline_id: String(item.timeline_id || `timeline-${index + 1}`).trim(),
          date: String(item.date || "待判断").trim(),
          source_id: String(item.source_id || "unknown-source").trim(),
          source_title: String(item.source_title || "未命名资料").trim(),
          relative_path: String(item.relative_path || "").trim(),
          event_summary: String(item.event_summary || "待补充").trim(),
          matched_excerpt_index: Number.isInteger(item.matched_excerpt_index) ? item.matched_excerpt_index : 1
        }))
      : [],
    evidence_summary: {
      excerpt_count: Number.isInteger(profile.evidence_summary?.excerpt_count) ? profile.evidence_summary.excerpt_count : 0,
      source_count: Number.isInteger(profile.evidence_summary?.source_count) ? profile.evidence_summary.source_count : 0,
      last_updated_at: String(profile.evidence_summary?.last_updated_at || "").trim(),
      key_evidence: normalizeStringArray(profile.evidence_summary?.key_evidence)
    },
    linked_relationships: {
      detected_as: Boolean(profile.linked_relationships?.detected_as),
      matched_existing_person_id: profile.linked_relationships?.matched_existing_person_id
        ? String(profile.linked_relationships.matched_existing_person_id).trim()
        : null,
      matched_existing_person_name: profile.linked_relationships?.matched_existing_person_name
        ? String(profile.linked_relationships.matched_existing_person_name).trim()
        : null
    }
  };
}

function normalizeStringArray(values) {
  const items = Array.isArray(values) ? values : [];
  return Array.from(
    new Set(
      items
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeResolutionAction(value) {
  const action = String(value || "").trim().toLowerCase();
  if (["create", "update", "ignore", "review"].includes(action)) {
    return action;
  }
  return "review";
}

function normalizeProfileTier(value) {
  const tier = String(value || "").trim().toLowerCase();
  if (tier && PROFILE_TIER_ORDER[tier] !== undefined) {
    return tier;
  }
  return "active";
}

function normalizeConfidence(value) {
  const confidence = String(value || "").trim().toLowerCase();
  if (confidence && CONFIDENCE_ORDER[confidence] !== undefined) {
    return confidence;
  }
  return "medium";
}

function guessProfileTier(candidate, resolutionAction) {
  if (resolutionAction === "update") {
    return "active";
  }
  if (candidate.priority === "high") {
    return "active";
  }
  return "stub";
}

function chooseProfileTier(left, right) {
  return PROFILE_TIER_ORDER[right] >= PROFILE_TIER_ORDER[left] ? right : left;
}

function chooseConfidence(left, right) {
  return CONFIDENCE_ORDER[right] >= CONFIDENCE_ORDER[left] ? right : left;
}

function resolveArrayOverride(overrideValues, fallbackValues) {
  if (Array.isArray(overrideValues)) {
    return normalizeStringArray(overrideValues);
  }
  return normalizeStringArray(fallbackValues);
}

function buildCandidateKey(personName) {
  return (__internal.normalizePersonName(personName) || String(personName || "").trim()).toLowerCase();
}

function buildProfileKey(profile) {
  return String(profile.person_ref || buildCandidateKey(profile.person_name)).trim().toLowerCase();
}

function buildPersonRef(personName) {
  const normalized = buildCandidateKey(personName).replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_");
  return `person_${normalized || "unknown"}`;
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

export const __review_internal = {
  buildIngestionContext,
  buildBaseProfile,
  applyProfileDecision,
  mergeProfile,
  shouldAutoCommitCandidate,
  buildPersonRef,
  buildCandidateKey
};

