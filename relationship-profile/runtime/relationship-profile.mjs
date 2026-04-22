// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRelationshipReviewResolutionSkillInfo } from "../../relationship-ingestion/runtime/relationship-review-resolution.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const runsDir = path.join(__dirname, "runs");
const { default_store_path: defaultStorePath } = getRelationshipReviewResolutionSkillInfo();

const SKILL_NAME = "relationship-profile";
const SKILL_VERSION = "0.1.0";
const DEFAULT_OPTIONS = {
  include_related_people: true,
  include_profile_health: true,
  write_store: false,
  save_run_artifacts: true,
  related_people_limit: 8,
  timeline_limit: 12,
  search_limit: 10,
  stale_days_threshold: 30
};
const PROFILE_TIER_ORDER = {
  archived: 0,
  stub: 1,
  active: 2,
  key: 3
};
const CONFIDENCE_ORDER = {
  low: 1,
  medium: 2,
  high: 3
};
const ARRAY_COMPILED_TRUTH_FIELDS = [
  "traits",
  "tags",
  "preferences",
  "boundaries",
  "risk_flags",
  "open_questions",
  "next_actions"
];
const SCALAR_COMPILED_TRUTH_FIELDS = [
  "summary",
  "current_judgment",
  "relationship_stage",
  "intent"
];

export function getRelationshipProfileSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    default_store_path: defaultStorePath
  };
}

export function runRelationshipProfile(payload) {
  const request = validateProfileRequest(payload);
  const processedAt = new Date().toISOString();
  const storePath = request.profile_store_path || defaultStorePath;
  const store = loadProfileStore(storePath);
  const storeOverview = buildStoreOverview(store.profiles, request.options, processedAt);

  let result;
  if (request.mode === "get_profile") {
    result = handleGetProfile({ request, store, storeOverview });
  } else if (request.mode === "search_profiles") {
    result = handleSearchProfiles({ request, store, storeOverview });
  } else if (request.mode === "maintain_store") {
    result = handleMaintainStore({ request, store, storeOverview });
  } else if (request.mode === "apply_profile_patch") {
    result = handleApplyProfilePatch({ request, store, storePath, storeOverview, processedAt });
  } else {
    throw new Error(`不支持的 relationship-profile mode: ${request.mode}`);
  }

  const response = {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    run_directory: null,
    ...result
  };

  if (request.options.save_run_artifacts) {
    response.run_directory = persistRunArtifacts({ request, response });
  }

  return response;
}

function handleGetProfile({ request, store, storeOverview }) {
  const resolution = resolveTargetProfile({ request, store });
  if (!resolution.profile) {
    return {
      status: "needs_review",
      mode: request.mode,
      target_person: null,
      profile_read: null,
      related_people: [],
      maintenance_report: null,
      search_results: resolution.candidates,
      store_overview: storeOverview,
      profile_store_delta: null,
      notes: resolution.note || "未找到唯一匹配的人物，建议先确认候选结果。"
    };
  }

  const targetProfile = resolution.profile;
  return {
    status: "success",
    mode: request.mode,
    target_person: buildTargetPerson(targetProfile),
    profile_read: buildProfileRead(targetProfile, request.options),
    related_people: request.options.include_related_people
      ? buildRelatedPeople(targetProfile, store.profiles, request.options.related_people_limit)
      : [],
    maintenance_report: request.options.include_profile_health
      ? buildProfileMaintenanceReport(targetProfile, request.options)
      : null,
    search_results: resolution.candidates,
    store_overview: storeOverview,
    profile_store_delta: null,
    notes: resolution.note || ""
  };
}

function handleSearchProfiles({ request, store, storeOverview }) {
  const search = searchProfiles({
    profiles: store.profiles,
    queryText: request.query_text,
    filters: request.filters,
    options: request.options
  });
  return {
    status: search.results.length ? "success" : "needs_review",
    mode: request.mode,
    target_person: null,
    profile_read: null,
    related_people: [],
    maintenance_report: null,
    search_results: search.results,
    store_overview: storeOverview,
    profile_store_delta: null,
    notes: search.note
  };
}

function handleMaintainStore({ request, store, storeOverview }) {
  const maintenance = buildStoreMaintenanceReport(store.profiles, request.options);
  return {
    status: "success",
    mode: request.mode,
    target_person: null,
    profile_read: null,
    related_people: [],
    maintenance_report: maintenance,
    search_results: [],
    store_overview: storeOverview,
    profile_store_delta: null,
    notes: ""
  };
}

function handleApplyProfilePatch({ request, store, storePath, storeOverview, processedAt }) {
  const resolution = resolveTargetProfile({ request, store, exactOnly: true });
  if (!resolution.profile) {
    return {
      status: "needs_review",
      mode: request.mode,
      target_person: null,
      profile_read: null,
      related_people: [],
      maintenance_report: null,
      search_results: resolution.candidates,
      store_overview: storeOverview,
      profile_store_delta: null,
      notes: resolution.note || "没有找到唯一可 patch 的档案，请先确认人物。"
    };
  }

  if (!request.profile_patch) {
    throw new Error("apply_profile_patch 模式必须传 profile_patch");
  }

  const patchedProfile = applyProfilePatch(resolution.profile, request.profile_patch, processedAt);
  const mergedProfiles = upsertProfile(store.profiles, patchedProfile);
  const storeWrite = request.options.write_store
    ? writeProfileStore(storePath, mergedProfiles, processedAt)
    : {
        store_path: storePath,
        written: false,
        total_profiles_after_write: mergedProfiles.length
      };

  const refreshedStoreOverview = buildStoreOverview(mergedProfiles, request.options, processedAt);
  return {
    status: "success",
    mode: request.mode,
    target_person: buildTargetPerson(patchedProfile),
    profile_read: buildProfileRead(patchedProfile, request.options),
    related_people: request.options.include_related_people
      ? buildRelatedPeople(patchedProfile, mergedProfiles, request.options.related_people_limit)
      : [],
    maintenance_report: request.options.include_profile_health
      ? buildProfileMaintenanceReport(patchedProfile, request.options)
      : null,
    search_results: [],
    store_overview: refreshedStoreOverview,
    profile_store_delta: {
      store_path: storeWrite.store_path,
      written: storeWrite.written,
      total_profiles_after_write: storeWrite.total_profiles_after_write,
      updated_profile: {
        person_name: patchedProfile.person_name,
        person_ref: patchedProfile.person_ref,
        profile_tier: patchedProfile.profile_tier
      }
    },
    notes: request.profile_patch.note ? String(request.profile_patch.note).trim() : ""
  };
}

function validateProfileRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("relationship-profile request 必须是对象");
  }

  const options = {
    ...DEFAULT_OPTIONS,
    ...(payload.options && typeof payload.options === "object" ? payload.options : {})
  };
  const filters = normalizeFilters(payload.filters);
  const targetProfile = payload.target_profile && typeof payload.target_profile === "object"
    ? normalizeRelationshipProfile(payload.target_profile)
    : null;
  const profilePatch = payload.profile_patch && typeof payload.profile_patch === "object"
    ? payload.profile_patch
    : null;

  const personName = normalizeString(payload.person_name);
  const personRef = normalizeString(payload.person_ref);
  const queryText = normalizeString(payload.query_text);
  const explicitMode = normalizeString(payload.mode);
  const derivedMode = explicitMode || deriveMode({
    personName,
    personRef,
    queryText,
    filters,
    targetProfile,
    profilePatch
  });

  if (!["get_profile", "search_profiles", "maintain_store", "apply_profile_patch"].includes(derivedMode)) {
    throw new Error(`relationship-profile mode 非法: ${derivedMode}`);
  }
  if (derivedMode === "apply_profile_patch" && !profilePatch) {
    throw new Error("apply_profile_patch 模式必须传 profile_patch");
  }

  return {
    skill: normalizeString(payload.skill) || SKILL_NAME,
    version: normalizeString(payload.version) || SKILL_VERSION,
    mode: derivedMode,
    person_name: personName,
    person_ref: personRef,
    query_text: queryText,
    profile_store_path: normalizeString(payload.profile_store_path) || null,
    target_profile: targetProfile,
    profile_patch: profilePatch,
    filters,
    options
  };
}

function deriveMode({ personName, personRef, queryText, filters, targetProfile, profilePatch }) {
  if (profilePatch) {
    return "apply_profile_patch";
  }
  if (targetProfile || personName || personRef) {
    return "get_profile";
  }
  if (queryText || hasActiveFilters(filters)) {
    return "search_profiles";
  }
  return "maintain_store";
}

function normalizeFilters(filters) {
  const payload = filters && typeof filters === "object" ? filters : {};
  return {
    profile_tiers: normalizeStringArray(payload.profile_tiers).filter((item) => PROFILE_TIER_ORDER[item] !== undefined),
    confidence_levels: normalizeStringArray(payload.confidence_levels).filter((item) => CONFIDENCE_ORDER[item] !== undefined),
    tags: normalizeStringArray(payload.tags),
    relationship_stage: normalizeString(payload.relationship_stage),
    needs_attention_only: Boolean(payload.needs_attention_only)
  };
}

function hasActiveFilters(filters) {
  return Boolean(
    filters.profile_tiers.length ||
    filters.confidence_levels.length ||
    filters.tags.length ||
    filters.relationship_stage ||
    filters.needs_attention_only
  );
}

function loadProfileStore(storePath) {
  if (!storePath || !existsSync(storePath)) {
    return {
      version: SKILL_VERSION,
      updated_at: "",
      profiles: []
    };
  }

  const raw = readFileSync(storePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  return {
    version: normalizeString(parsed.version) || SKILL_VERSION,
    updated_at: normalizeString(parsed.updated_at),
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
        profiles: profiles.map((profile) => normalizeRelationshipProfile(profile))
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return {
    store_path: storePath,
    written: true,
    total_profiles_after_write: profiles.length
  };
}

function resolveTargetProfile({ request, store, exactOnly = false }) {
  if (request.target_profile) {
    return {
      profile: request.target_profile,
      candidates: [],
      note: ""
    };
  }

  const exactMatch = store.profiles.find((profile) => isExactProfileMatch(profile, request.person_name, request.person_ref));
  if (exactMatch) {
    return {
      profile: exactMatch,
      candidates: [],
      note: ""
    };
  }

  const search = searchProfiles({
    profiles: store.profiles,
    queryText: request.person_name || request.person_ref || request.query_text,
    filters: request.filters,
    options: request.options
  });
  const best = search.results[0];
  if (!exactOnly && best && best.score >= 100) {
    const profile = store.profiles.find((item) => item.person_ref === best.person_ref);
    if (profile) {
      return {
        profile,
        candidates: search.results.slice(0, request.options.search_limit),
        note: best.match_reasons.join("；")
      };
    }
  }

  return {
    profile: null,
    candidates: search.results.slice(0, request.options.search_limit),
    note: search.note
  };
}

function isExactProfileMatch(profile, personName, personRef) {
  if (personRef && normalizeKey(profile.person_ref) === normalizeKey(personRef)) {
    return true;
  }
  if (!personName) {
    return false;
  }
  const normalizedName = normalizeKey(personName);
  if (normalizeKey(profile.person_name) === normalizedName) {
    return true;
  }
  return profile.aliases.some((alias) => normalizeKey(alias) === normalizedName);
}

function searchProfiles({ profiles, queryText, filters, options }) {
  const query = normalizeKey(queryText);
  const results = profiles
    .map((profile) => scoreProfileMatch(profile, query, filters, options))
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.person_name.localeCompare(right.person_name, "zh-Hans-CN");
    })
    .slice(0, options.search_limit);

  return {
    results,
    note: results.length ? "" : "当前 store 中没有找到合适的档案匹配。"
  };
}

function scoreProfileMatch(profile, query, filters, options) {
  const maintenance = buildProfileMaintenanceReport(profile, options);
  if (!profileMatchesFilters(profile, filters, maintenance)) {
    return null;
  }

  let score = 0;
  const reasons = [];

  if (query) {
    const exactTokens = [profile.person_name, profile.person_ref, ...profile.aliases].map((item) => normalizeKey(item));
    if (exactTokens.includes(query)) {
      score += 100;
      reasons.push("姓名 / 别名精确命中");
    } else {
      if (normalizeKey(profile.person_name).includes(query)) {
        score += 60;
        reasons.push("姓名包含关键词");
      }
      if (profile.aliases.some((alias) => normalizeKey(alias).includes(query))) {
        score += 45;
        reasons.push("别名包含关键词");
      }
      const tagHits = profile.compiled_truth.tags.filter((tag) => normalizeKey(tag).includes(query));
      if (tagHits.length) {
        score += 30;
        reasons.push(`标签命中: ${tagHits.join(" / ")}`);
      }
      const stage = normalizeKey(profile.compiled_truth.relationship_stage);
      if (stage.includes(query)) {
        score += 18;
        reasons.push("关系阶段命中");
      }
      const textHits = countTextHits(buildProfileCorpus(profile), query);
      if (textHits > 0) {
        score += Math.min(40, textHits * 6);
        reasons.push("档案内容包含关键词");
      }
    }
  } else {
    score += PROFILE_TIER_ORDER[profile.profile_tier] * 10;
    score += CONFIDENCE_ORDER[profile.confidence] * 5;
    if (maintenance.attention_flags.length) {
      score += 8;
      reasons.push("需要优先关注");
    }
  }

  if (filters.needs_attention_only && maintenance.attention_flags.length) {
    score += 10;
    reasons.push("命中待关注条件");
  }

  if (score <= 0) {
    return null;
  }

  return {
    person_name: profile.person_name,
    person_ref: profile.person_ref,
    profile_tier: profile.profile_tier,
    confidence: profile.confidence,
    relationship_stage: profile.compiled_truth.relationship_stage,
    summary: profile.compiled_truth.summary,
    last_updated_at: profile.evidence_summary.last_updated_at,
    needs_attention: Boolean(maintenance.attention_flags.length),
    match_reasons: reasons,
    score
  };
}

function profileMatchesFilters(profile, filters, maintenance) {
  if (filters.profile_tiers.length && !filters.profile_tiers.includes(profile.profile_tier)) {
    return false;
  }
  if (filters.confidence_levels.length && !filters.confidence_levels.includes(profile.confidence)) {
    return false;
  }
  if (filters.relationship_stage && profile.compiled_truth.relationship_stage !== filters.relationship_stage) {
    return false;
  }
  if (filters.tags.length) {
    const tagSet = new Set(profile.compiled_truth.tags.map((tag) => normalizeKey(tag)));
    const hasTag = filters.tags.some((tag) => tagSet.has(normalizeKey(tag)));
    if (!hasTag) {
      return false;
    }
  }
  if (filters.needs_attention_only && !maintenance.attention_flags.length) {
    return false;
  }
  return true;
}

function buildTargetPerson(profile) {
  return {
    person_name: profile.person_name,
    person_ref: profile.person_ref,
    profile_tier: profile.profile_tier,
    confidence: profile.confidence,
    relationship_stage: profile.compiled_truth.relationship_stage,
    summary: profile.compiled_truth.summary,
    last_updated_at: profile.evidence_summary.last_updated_at
  };
}

function buildProfileRead(profile, options) {
  const timeline = profile.timeline
    .slice()
    .sort((left, right) => normalizeDateKey(right.date).localeCompare(normalizeDateKey(left.date)))
    .slice(0, options.timeline_limit)
    .map((item) => ({
      date: item.date,
      source_title: item.source_title,
      relative_path: item.relative_path,
      event_summary: item.event_summary,
      matched_excerpt_index: item.matched_excerpt_index
    }));

  return {
    summary_card: {
      person_name: profile.person_name,
      person_ref: profile.person_ref,
      summary: profile.compiled_truth.summary,
      current_judgment: profile.compiled_truth.current_judgment,
      relationship_stage: profile.compiled_truth.relationship_stage,
      profile_tier: profile.profile_tier,
      confidence: profile.confidence,
      resolution_action: profile.resolution_action
    },
    signal_board: {
      intent: profile.compiled_truth.intent,
      attitude: profile.compiled_truth.attitude,
      traits: profile.compiled_truth.traits,
      tags: profile.compiled_truth.tags,
      preferences: profile.compiled_truth.preferences,
      boundaries: profile.compiled_truth.boundaries,
      risk_flags: profile.compiled_truth.risk_flags
    },
    action_board: {
      next_actions: profile.compiled_truth.next_actions,
      open_questions: profile.compiled_truth.open_questions
    },
    evidence_digest: {
      excerpt_count: profile.evidence_summary.excerpt_count,
      source_count: profile.evidence_summary.source_count,
      last_updated_at: profile.evidence_summary.last_updated_at,
      key_evidence: profile.evidence_summary.key_evidence
    },
    timeline_digest: timeline
  };
}

function buildProfileMaintenanceReport(profile, options) {
  const missingFields = [];
  if (!profile.compiled_truth.summary || profile.compiled_truth.summary === "待判断") {
    missingFields.push("summary");
  }
  if (!profile.compiled_truth.intent || profile.compiled_truth.intent === "待判断") {
    missingFields.push("intent");
  }
  if (!profile.compiled_truth.tags.length) {
    missingFields.push("tags");
  }
  if (!profile.compiled_truth.traits.length) {
    missingFields.push("traits");
  }
  if (!profile.compiled_truth.next_actions.length) {
    missingFields.push("next_actions");
  }
  if (!profile.timeline.length) {
    missingFields.push("timeline");
  }
  if (!profile.evidence_summary.key_evidence.length) {
    missingFields.push("key_evidence");
  }

  const freshness = buildFreshness(profile.evidence_summary.last_updated_at, options.stale_days_threshold);
  const attentionFlags = [];
  if (freshness.level === "stale") {
    attentionFlags.push("档案长时间未更新");
  }
  if (profile.confidence === "low") {
    attentionFlags.push("置信度偏低");
  }
  if (profile.compiled_truth.open_questions.length) {
    attentionFlags.push("存在未闭环问题");
  }
  if (profile.compiled_truth.risk_flags.length) {
    attentionFlags.push("存在风险信号");
  }
  if (missingFields.length) {
    attentionFlags.push(`缺少字段: ${missingFields.join(", ")}`);
  }
  if (profile.profile_tier === "key" && profile.confidence !== "high") {
    attentionFlags.push("关键人物档案置信度仍不足");
  }

  const conflictSignals = [];
  if (profile.resolution_action === "create" && profile.linked_relationships.matched_existing_person_id) {
    conflictSignals.push("档案标记为 create，但同时存在 matched_existing_person_id");
  }
  if (
    profile.compiled_truth.relationship_stage === "稳定联系" &&
    profile.compiled_truth.summary.includes("初识")
  ) {
    conflictSignals.push("summary 与 relationship_stage 可能不一致");
  }

  const recommendedActions = [];
  if (profile.compiled_truth.open_questions.length) {
    recommendedActions.push("优先补齐 open_questions 对应的信息缺口。");
  }
  if (!profile.compiled_truth.next_actions.length) {
    recommendedActions.push("补一条明确的 next_actions，避免档案停留在描述层。");
  }
  if (!profile.timeline.length) {
    recommendedActions.push("补至少一条 timeline 事件，确保档案可追溯。");
  }
  if (profile.confidence === "low") {
    recommendedActions.push("后续遇到该人物的新资料时，优先做一次 review 确认。");
  }
  if (freshness.level === "stale") {
    recommendedActions.push("档案已 stale，建议用近期资料做一次增量更新。");
  }
  if (!recommendedActions.length) {
    recommendedActions.push("当前档案结构完整，可继续按新资料增量维护。");
  }

  return {
    freshness,
    missing_fields: missingFields,
    attention_flags: attentionFlags,
    conflict_signals: conflictSignals,
    recommended_actions: uniqueStrings(recommendedActions)
  };
}

function buildFreshness(lastUpdatedAt, staleDaysThreshold) {
  if (!lastUpdatedAt) {
    return {
      last_updated_at: "",
      days_since_update: null,
      level: "unknown"
    };
  }
  const updatedAt = new Date(lastUpdatedAt);
  if (Number.isNaN(updatedAt.getTime())) {
    return {
      last_updated_at: lastUpdatedAt,
      days_since_update: null,
      level: "unknown"
    };
  }
  const diffMs = Date.now() - updatedAt.getTime();
  const days = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
  let level = "fresh";
  if (days >= staleDaysThreshold) {
    level = "stale";
  } else if (days >= Math.max(7, Math.floor(staleDaysThreshold / 2))) {
    level = "watch";
  }
  return {
    last_updated_at: lastUpdatedAt,
    days_since_update: days,
    level
  };
}

function buildRelatedPeople(targetProfile, profiles, limit) {
  const targetCorpus = buildProfileCorpus(targetProfile);
  const targetSources = new Set(targetProfile.timeline.map((item) => item.source_id));
  const targetTags = new Set(targetProfile.compiled_truth.tags.map((tag) => normalizeKey(tag)));

  return profiles
    .filter((profile) => buildProfileKey(profile) !== buildProfileKey(targetProfile))
    .map((profile) => {
      const profileCorpus = buildProfileCorpus(profile);
      const sharedSources = profile.timeline
        .map((item) => item.source_id)
        .filter((sourceId) => targetSources.has(sourceId));
      const sharedTags = profile.compiled_truth.tags.filter((tag) => targetTags.has(normalizeKey(tag)));
      const mentionedInTarget = countProfileMentions(targetCorpus, profile);
      const mentionedInOther = countProfileMentions(profileCorpus, targetProfile);
      const score = (sharedSources.length * 5) + (sharedTags.length * 2) + (mentionedInTarget * 4) + (mentionedInOther * 2);
      if (score <= 0) {
        return null;
      }
      const reasons = [];
      if (sharedSources.length) {
        reasons.push(`共享资料源 ${sharedSources.length} 个`);
      }
      if (sharedTags.length) {
        reasons.push(`共享标签: ${sharedTags.join(" / ")}`);
      }
      if (mentionedInTarget || mentionedInOther) {
        reasons.push("档案内容中互相提及");
      }
      return {
        person_name: profile.person_name,
        person_ref: profile.person_ref,
        relation_type: classifyRelationType({ sharedSources, sharedTags, mentionedInTarget, mentionedInOther }),
        relation_score: score,
        relation_reasons: reasons,
        shared_sources: uniqueStrings(sharedSources),
        shared_tags: uniqueStrings(sharedTags)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.relation_score - left.relation_score)
    .slice(0, limit);
}

function classifyRelationType({ sharedSources, sharedTags, mentionedInTarget, mentionedInOther }) {
  if (sharedSources.length && (mentionedInTarget || mentionedInOther)) {
    return "same_context_and_mentioned";
  }
  if (sharedSources.length) {
    return "same_source_context";
  }
  if (mentionedInTarget || mentionedInOther) {
    return "mentioned_together";
  }
  if (sharedTags.length) {
    return "shared_role";
  }
  return "weak_link";
}

function buildStoreMaintenanceReport(profiles, options) {
  const maintenanceItems = profiles.map((profile) => ({
    profile,
    maintenance: buildProfileMaintenanceReport(profile, options)
  }));

  const staleProfiles = maintenanceItems
    .filter((item) => item.maintenance.freshness.level === "stale")
    .map(({ profile, maintenance }) => ({
      person_name: profile.person_name,
      person_ref: profile.person_ref,
      reason: maintenance.attention_flags.join("；") || "档案已 stale"
    }));
  const lowConfidenceProfiles = maintenanceItems
    .filter((item) => item.profile.confidence === "low")
    .map(({ profile, maintenance }) => ({
      person_name: profile.person_name,
      person_ref: profile.person_ref,
      reason: maintenance.attention_flags.join("；") || "置信度偏低"
    }));
  const openQuestionQueue = maintenanceItems
    .filter((item) => item.profile.compiled_truth.open_questions.length)
    .sort((left, right) => right.profile.compiled_truth.open_questions.length - left.profile.compiled_truth.open_questions.length)
    .slice(0, options.search_limit)
    .map(({ profile }) => ({
      person_name: profile.person_name,
      person_ref: profile.person_ref,
      open_questions: profile.compiled_truth.open_questions
    }));

  const attentionQueue = maintenanceItems
    .filter((item) => item.maintenance.attention_flags.length)
    .sort((left, right) => right.maintenance.attention_flags.length - left.maintenance.attention_flags.length)
    .slice(0, options.search_limit)
    .map(({ profile, maintenance }) => ({
      person_name: profile.person_name,
      person_ref: profile.person_ref,
      profile_tier: profile.profile_tier,
      confidence: profile.confidence,
      attention_flags: maintenance.attention_flags
    }));

  return {
    stale_profiles: staleProfiles,
    low_confidence_profiles: lowConfidenceProfiles,
    open_question_queue: openQuestionQueue,
    attention_queue: attentionQueue
  };
}

function buildStoreOverview(profiles, options, processedAt) {
  const maintenance = buildStoreMaintenanceReport(profiles, options);
  const byTier = {
    stub: 0,
    active: 0,
    key: 0,
    archived: 0
  };
  const byConfidence = {
    low: 0,
    medium: 0,
    high: 0
  };
  profiles.forEach((profile) => {
    byTier[profile.profile_tier] += 1;
    byConfidence[profile.confidence] += 1;
  });
  return {
    profile_count: profiles.length,
    by_tier: byTier,
    by_confidence: byConfidence,
    attention_count: maintenance.attention_queue.length,
    stale_count: maintenance.stale_profiles.length,
    updated_at: processedAt
  };
}

function applyProfilePatch(profile, patch, processedAt) {
  const merged = clone(profile);
  const patchEvidence = Array.isArray(patch.evidence_append) ? normalizeStringArray(patch.evidence_append) : [];
  const patchTimeline = Array.isArray(patch.timeline_append) ? patch.timeline_append : [];

  if (patch.resolution_action) {
    merged.resolution_action = normalizeResolutionAction(patch.resolution_action);
  }
  if (patch.profile_tier) {
    merged.profile_tier = normalizeProfileTier(patch.profile_tier);
  }
  if (patch.confidence) {
    merged.confidence = normalizeConfidence(patch.confidence);
  }

  if (Array.isArray(patch.aliases_replace)) {
    merged.aliases = normalizeStringArray(patch.aliases_replace);
  }
  if (Array.isArray(patch.aliases_add)) {
    merged.aliases = uniqueStrings([...merged.aliases, ...normalizeStringArray(patch.aliases_add)]);
  }

  const compiledTruthPatch = patch.compiled_truth && typeof patch.compiled_truth === "object" ? patch.compiled_truth : {};
  const compiledTruthAdditions = patch.compiled_truth_additions && typeof patch.compiled_truth_additions === "object"
    ? patch.compiled_truth_additions
    : {};

  SCALAR_COMPILED_TRUTH_FIELDS.forEach((field) => {
    const value = normalizeString(compiledTruthPatch[field]);
    if (value) {
      merged.compiled_truth[field] = value;
    }
  });

  if (compiledTruthPatch.attitude && typeof compiledTruthPatch.attitude === "object") {
    const label = normalizeString(compiledTruthPatch.attitude.label);
    const reason = normalizeString(compiledTruthPatch.attitude.reason);
    if (label) {
      merged.compiled_truth.attitude.label = label;
    }
    if (reason || compiledTruthPatch.attitude.reason === "") {
      merged.compiled_truth.attitude.reason = reason;
    }
  }

  ARRAY_COMPILED_TRUTH_FIELDS.forEach((field) => {
    if (Array.isArray(compiledTruthPatch[field])) {
      merged.compiled_truth[field] = normalizeStringArray(compiledTruthPatch[field]);
    }
    if (Array.isArray(compiledTruthAdditions[field])) {
      merged.compiled_truth[field] = uniqueStrings([
        ...merged.compiled_truth[field],
        ...normalizeStringArray(compiledTruthAdditions[field])
      ]);
    }
  });

  if (patchTimeline.length) {
    const existingCount = merged.timeline.length;
    const appended = patchTimeline.map((item, index) => normalizeTimelineItem(item, existingCount + index + 1));
    merged.timeline = [...merged.timeline, ...appended];
  }

  if (patchEvidence.length) {
    merged.evidence_summary.key_evidence = uniqueStrings([
      ...merged.evidence_summary.key_evidence,
      ...patchEvidence
    ]);
  }

  const baseExcerptCount = Number.isInteger(profile.evidence_summary?.excerpt_count)
    ? profile.evidence_summary.excerpt_count
    : merged.evidence_summary.excerpt_count;
  const excerptIncrement = patchEvidence.length + patchTimeline.length;
  merged.evidence_summary.excerpt_count = Math.max(
    baseExcerptCount + excerptIncrement,
    merged.evidence_summary.key_evidence.length
  );
  const distinctSources = new Set(merged.timeline.map((item) => item.source_id).filter(Boolean));
  merged.evidence_summary.source_count = Math.max(merged.evidence_summary.source_count, distinctSources.size);
  merged.evidence_summary.last_updated_at = processedAt;

  return normalizeRelationshipProfile(merged);
}

function upsertProfile(profiles, patchedProfile) {
  const nextProfiles = profiles.map((profile) => normalizeRelationshipProfile(profile));
  const index = nextProfiles.findIndex((profile) => buildProfileKey(profile) === buildProfileKey(patchedProfile));
  if (index >= 0) {
    nextProfiles[index] = normalizeRelationshipProfile(patchedProfile);
  } else {
    nextProfiles.push(normalizeRelationshipProfile(patchedProfile));
  }
  return nextProfiles.sort((left, right) => left.person_name.localeCompare(right.person_name, "zh-Hans-CN"));
}

function normalizeRelationshipProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new Error("relationship profile 必须是对象");
  }

  const personName = normalizeString(profile.person_name);
  if (!personName) {
    throw new Error("relationship profile 缺少 person_name");
  }

  return {
    person_name: personName,
    person_ref: normalizeString(profile.person_ref) || buildPersonRef(personName),
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
      ? profile.timeline.map((item, index) => normalizeTimelineItem(item, index + 1))
      : [],
    evidence_summary: {
      excerpt_count: Number.isInteger(profile.evidence_summary?.excerpt_count) ? profile.evidence_summary.excerpt_count : 0,
      source_count: Number.isInteger(profile.evidence_summary?.source_count) ? profile.evidence_summary.source_count : 0,
      last_updated_at: normalizeString(profile.evidence_summary?.last_updated_at),
      key_evidence: normalizeStringArray(profile.evidence_summary?.key_evidence)
    },
    linked_relationships: {
      detected_as: Boolean(profile.linked_relationships?.detected_as),
      matched_existing_person_id: normalizeNullableString(profile.linked_relationships?.matched_existing_person_id),
      matched_existing_person_name: normalizeNullableString(profile.linked_relationships?.matched_existing_person_name)
    }
  };
}

function normalizeTimelineItem(item, index) {
  return {
    timeline_id: normalizeString(item?.timeline_id) || `timeline-${index}`,
    date: normalizeString(item?.date) || "待判断",
    source_id: normalizeString(item?.source_id) || "unknown-source",
    source_title: normalizeString(item?.source_title) || "未命名资料",
    relative_path: normalizeString(item?.relative_path),
    event_summary: normalizeString(item?.event_summary) || "待补充",
    matched_excerpt_index: Number.isInteger(item?.matched_excerpt_index) ? item.matched_excerpt_index : index
  };
}

function buildProfileCorpus(profile) {
  return [
    profile.person_name,
    ...profile.aliases,
    profile.compiled_truth.summary,
    profile.compiled_truth.current_judgment,
    profile.compiled_truth.intent,
    profile.compiled_truth.relationship_stage,
    profile.compiled_truth.attitude.label,
    profile.compiled_truth.attitude.reason,
    ...profile.compiled_truth.tags,
    ...profile.compiled_truth.traits,
    ...profile.compiled_truth.preferences,
    ...profile.compiled_truth.boundaries,
    ...profile.compiled_truth.risk_flags,
    ...profile.compiled_truth.open_questions,
    ...profile.compiled_truth.next_actions,
    ...profile.timeline.map((item) => item.event_summary),
    ...profile.evidence_summary.key_evidence
  ]
    .filter(Boolean)
    .join("\n");
}

function countTextHits(corpus, query) {
  if (!query || !corpus) {
    return 0;
  }
  const normalizedCorpus = normalizeKey(corpus);
  if (!normalizedCorpus.includes(query)) {
    return 0;
  }
  return normalizedCorpus.split(query).length - 1;
}

function countProfileMentions(corpus, profile) {
  const tokens = [profile.person_name, ...profile.aliases]
    .map((item) => normalizeString(item))
    .filter((item) => shouldUseMentionToken(item));
  return tokens.reduce((total, token) => total + countTextHits(corpus, normalizeKey(token)), 0);
}

function shouldUseMentionToken(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return false;
  }
  if (/^[A-Za-z]+$/.test(normalized) && normalized.length < 3) {
    return false;
  }
  return normalized.length >= 2;
}

function buildProfileKey(profile) {
  return normalizeKey(profile.person_ref || profile.person_name);
}

function buildPersonRef(personName) {
  const normalized = normalizeKey(personName).replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "_");
  return `person_${normalized || "unknown"}`;
}

function normalizeResolutionAction(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ["create", "update", "ignore", "review"].includes(normalized) ? normalized : "review";
}

function normalizeProfileTier(value) {
  const normalized = normalizeString(value).toLowerCase();
  return PROFILE_TIER_ORDER[normalized] !== undefined ? normalized : "active";
}

function normalizeConfidence(value) {
  const normalized = normalizeString(value).toLowerCase();
  return CONFIDENCE_ORDER[normalized] !== undefined ? normalized : "medium";
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return uniqueStrings(values.map((item) => normalizeString(item)).filter(Boolean));
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeDateKey(value) {
  const normalized = normalizeString(value);
  return normalized || "0000-00-00";
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((item) => normalizeString(item)).filter(Boolean)));
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function persistRunArtifacts({ request, response }) {
  ensureDirectory(runsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = normalizeKey(request.person_ref || request.person_name || request.query_text || request.mode || "profile")
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-");
  const runDirectory = path.join(runsDir, `${stamp}-${safeId || "profile"}`);
  ensureDirectory(runDirectory);
  writeFileSync(path.join(runDirectory, "request.json"), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "response.json"), `${JSON.stringify(response, null, 2)}\n`, "utf8");
  return runDirectory;
}

export const __profile_internal = {
  normalizeRelationshipProfile,
  buildProfileMaintenanceReport,
  buildStoreMaintenanceReport,
  searchProfiles,
  applyProfilePatch,
  buildRelatedPeople,
  resolveTargetProfile
};

