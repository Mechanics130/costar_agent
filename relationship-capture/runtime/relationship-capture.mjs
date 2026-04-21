// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runRelationshipIngestion
} from "../../relationship-ingestion/runtime/relationship-ingestion.mjs";
import {
  getRelationshipReviewResolutionSkillInfo,
  runRelationshipReviewResolution
} from "../../relationship-ingestion/runtime/relationship-review-resolution.mjs";
import {
  getRelationshipViewSkillInfo,
  runRelationshipView
} from "../../relationship-view/runtime/relationship-view.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const relationshipIngestionRoot = path.resolve(skillRoot, "..", "relationship-ingestion");
const relationshipScenarioRoot = path.join(relationshipIngestionRoot, "incremental-scenarios");
const { default_store_path: defaultStorePath } = getRelationshipReviewResolutionSkillInfo();
const {
  default_view_store_path: defaultViewStorePath,
  default_markdown_dir: defaultViewMarkdownDir
} = getRelationshipViewSkillInfo();

const SKILL_NAME = "relationship-capture";
const SKILL_VERSION = "0.1.0";
const DEFAULT_CAPTURE_OPTIONS = {
  auto_context_from_store: true,
  auto_context_limit: 8,
  auto_context_scan_sources: true,
  auto_refresh_views_after_commit: true
};
const PROFILE_STORE_FILE_PATTERN = /^relationship-profile-store.*\.json$/i;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export function getRelationshipCaptureSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    default_profile_store_path: defaultStorePath
  };
}

export async function runRelationshipCapture(payload, fallbackConfig = {}) {
  const request = validateCaptureRequest(payload);

  if (request.stage === "commit") {
    const reviewResult = runRelationshipReviewResolution({
      skill: "relationship-review-resolution",
      version: "0.1.0",
      ingestion_result: request.ingestion_result,
      review_decisions: request.review_decisions,
      existing_profiles: request.existing_profiles,
      profile_store_path: request.profile_store_path,
      operator: request.operator,
      notes: request.notes,
      options: request.review_options
    });
    const viewRefreshResult = buildViewRefreshAfterCommit(request, reviewResult);

    const processingFeedback = buildProcessingFeedbackFromIngestion(request.ingestion_result);
    const commitFeedback = buildCommitFeedback(reviewResult);
    const confirmationRequest = buildConfirmationRequestAfterCommit(reviewResult);

    return {
      skill: SKILL_NAME,
      version: SKILL_VERSION,
      status: reviewResult.status,
      stage: "commit",
      receipt: buildCommitReceipt(request, reviewResult),
      processing_feedback: processingFeedback,
      confirmation_request: confirmationRequest,
      next_action: buildNextActionForCommit(reviewResult, viewRefreshResult),
      user_feedback: buildUserFeedbackForCommit(reviewResult, viewRefreshResult),
      ingestion_result: request.ingestion_result,
      review_resolution_result: reviewResult,
      view_refresh_result: viewRefreshResult,
      commit_feedback: commitFeedback,
      notes: request.notes || ""
    };
  }

  const autoContext = request.ingestion_result ? null : deriveAutoContext(request);
  const effectiveExistingPeople = autoContext ? autoContext.existing_people : request.existing_people;

  const ingestionResult = request.ingestion_result
    ? request.ingestion_result
    : await runRelationshipIngestion(
        {
          request_id: request.request_id,
          goal: request.goal,
          target_people: request.target_people,
          focus_people: request.focus_people,
          focus_instruction: request.focus_instruction,
          existing_people: effectiveExistingPeople,
          sources: request.sources,
          options: request.options,
          model_config: request.model_config
        },
        fallbackConfig
      );

  const processingFeedback = buildProcessingFeedbackFromIngestion(ingestionResult);
  const confirmationRequest = buildConfirmationRequestFromIngestion(ingestionResult);

  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    status: confirmationRequest.required ? "needs_review" : ingestionResult.status || "success",
    stage: "ingestion",
    receipt: buildIngestionReceipt(request, ingestionResult, autoContext, effectiveExistingPeople),
    processing_feedback: processingFeedback,
    confirmation_request: confirmationRequest,
    next_action: buildNextActionForIngestion(confirmationRequest, processingFeedback),
    user_feedback: buildUserFeedbackForIngestion(processingFeedback, confirmationRequest, autoContext),
    ingestion_result: ingestionResult,
    review_resolution_result: null,
    view_refresh_result: null,
    commit_feedback: null,
    notes: request.notes || ""
  };
}

function buildViewRefreshAfterCommit(request, reviewResult) {
  const autoRefreshEnabled = request.options.auto_refresh_views_after_commit !== false;
  const committedProfiles = Array.isArray(reviewResult?.committed_profiles) ? reviewResult.committed_profiles : [];
  if (!autoRefreshEnabled || !committedProfiles.length) {
    return {
      attempted: false,
      refreshed_count: 0,
      reason: committedProfiles.length ? "disabled" : "no_committed_profiles",
      refreshed_views: [],
      view_store_path: normalizeOptionalString(request.view_store_path) || defaultViewStorePath,
      markdown_dir: normalizeOptionalString(request.view_markdown_dir) || defaultViewMarkdownDir,
      result: null
    };
  }

  if (reviewResult?.profile_store_delta?.written !== true) {
    return {
      attempted: false,
      refreshed_count: 0,
      reason: "profile_store_not_written",
      refreshed_views: [],
      view_store_path: normalizeOptionalString(request.view_store_path) || defaultViewStorePath,
      markdown_dir: normalizeOptionalString(request.view_markdown_dir) || defaultViewMarkdownDir,
      result: null
    };
  }

  const profileStorePath = normalizeOptionalString(reviewResult?.profile_store_delta?.store_path)
    || normalizeOptionalString(request.profile_store_path)
    || defaultStorePath;
  const viewStorePath = normalizeOptionalString(request.view_store_path) || defaultViewStorePath;
  const markdownDir = normalizeOptionalString(request.view_markdown_dir) || defaultViewMarkdownDir;

  const viewResult = runRelationshipView({
    mode: "refresh_people_views",
    profile_store_path: profileStorePath,
    graph_review_store_path: normalizeOptionalString(request.graph_review_store_path),
    view_store_path: viewStorePath,
    people: committedProfiles.map((profile) => ({
      person_ref: profile.person_ref,
      person_name: profile.person_name
    })),
    options: {
      write_store: true,
      write_markdown: true,
      save_run_artifacts: true,
      markdown_dir: markdownDir
    }
  });

  return {
    attempted: true,
    refreshed_count: Array.isArray(viewResult?.refreshed_views) ? viewResult.refreshed_views.length : 0,
    reason: "success",
    refreshed_views: Array.isArray(viewResult?.refreshed_views) ? viewResult.refreshed_views : [],
    view_store_path: viewStorePath,
    markdown_dir: markdownDir,
    result: viewResult
  };
}

function validateCaptureRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("relationship-capture 请求体必须是 JSON 对象。");
  }

  const hasSources = Array.isArray(payload.sources) && payload.sources.length > 0;
  const hasIngestionResult = Boolean(payload.ingestion_result && typeof payload.ingestion_result === "object");
  const hasReviewDecisions = Array.isArray(payload.review_decisions) && payload.review_decisions.length > 0;

  if (!hasSources && !hasIngestionResult) {
    throw new Error("relationship-capture 至少需要 sources 或 ingestion_result。");
  }

  if (hasReviewDecisions && !hasIngestionResult) {
    throw new Error("传入 review_decisions 时必须同时提供 ingestion_result。");
  }

  return {
    stage: hasReviewDecisions ? "commit" : "ingestion",
    request_id: normalizeOptionalString(payload.request_id),
    goal: normalizeOptionalString(payload.goal),
    target_people: normalizeStringArray(payload.target_people),
    focus_people: normalizeStringArray(payload.focus_people),
    focus_instruction: normalizeOptionalString(payload.focus_instruction),
    existing_people: normalizeExistingPeople(payload.existing_people),
    sources: Array.isArray(payload.sources) ? payload.sources : [],
    options: {
      ...DEFAULT_CAPTURE_OPTIONS,
      ...(payload.options && typeof payload.options === "object" ? payload.options : {})
    },
    model_config: payload.model_config && typeof payload.model_config === "object" ? payload.model_config : null,
    ingestion_result: hasIngestionResult ? payload.ingestion_result : null,
    review_decisions: hasReviewDecisions ? payload.review_decisions : [],
    existing_profiles: Array.isArray(payload.existing_profiles) ? payload.existing_profiles : [],
    profile_store_path: normalizeOptionalString(payload.profile_store_path),
    view_store_path: normalizeOptionalString(payload.view_store_path),
    view_markdown_dir: normalizeOptionalString(payload.view_markdown_dir),
    graph_review_store_path: normalizeOptionalString(payload.graph_review_store_path),
    operator: normalizeOptionalString(payload.operator),
    notes: normalizeOptionalString(payload.notes),
    review_options: payload.review_options && typeof payload.review_options === "object" ? payload.review_options : {}
  };
}

function deriveAutoContext(request) {
  const explicitPeople = normalizeExistingPeople(request.existing_people);
  const disabled = !request.options.auto_context_from_store;
  if (disabled) {
    return {
      applied: false,
      added_count: 0,
      matched_people: [],
      store_paths: [],
      reason: "disabled",
      existing_people: explicitPeople
    };
  }

  const storePaths = discoverProfileStorePaths(request);
  if (!storePaths.length) {
    return {
      applied: false,
      added_count: 0,
      matched_people: [],
      store_paths: [],
      reason: "no_store",
      existing_people: explicitPeople
    };
  }

  const profiles = loadProfilesFromStores(storePaths);
  if (!profiles.length) {
    return {
      applied: false,
      added_count: 0,
      matched_people: [],
      store_paths: storePaths,
      reason: "empty_store",
      existing_people: explicitPeople
    };
  }

  const rankedProfiles = rankProfilesForRequest(profiles, request);
  const selectedProfiles = rankedProfiles
    .slice(0, Math.max(1, Number(request.options.auto_context_limit || DEFAULT_CAPTURE_OPTIONS.auto_context_limit)))
    .map((item) => ({
      ...profileToExistingPerson(item.profile),
      _score: item.score,
      _match_reasons: item.match_reasons
    }));

  const mergedPeople = mergeExistingPeople(explicitPeople, selectedProfiles);
  const explicitKeys = new Set(explicitPeople.map(buildExistingPersonKey));
  const addedPeople = mergedPeople.filter((person) => !explicitKeys.has(buildExistingPersonKey(person)));

  return {
    applied: addedPeople.length > 0,
    added_count: addedPeople.length,
    matched_people: addedPeople.map((person) => person.name),
    store_paths: storePaths,
    reason: addedPeople.length ? "matched" : "no_match",
    existing_people: mergedPeople
  };
}

function discoverProfileStorePaths(request) {
  const candidatePaths = [];
  const explicitStorePath = normalizeOptionalString(request.profile_store_path);
  if (explicitStorePath) {
    candidatePaths.push(explicitStorePath);
  }

  const optionStorePaths = Array.isArray(request.options.profile_store_paths)
    ? request.options.profile_store_paths.map((item) => normalizeOptionalString(item)).filter(Boolean)
    : [];
  candidatePaths.push(...optionStorePaths);

  if (defaultStorePath) {
    candidatePaths.push(defaultStorePath);
  }

  if (existsSync(relationshipScenarioRoot)) {
    candidatePaths.push(...discoverScenarioProfileStores(relationshipScenarioRoot));
  }

  return [...new Set(candidatePaths.map((item) => path.resolve(item)).filter((item) => existsSync(item)))];
}

function discoverScenarioProfileStores(rootPath) {
  const discovered = [];
  const entries = readdirSync(rootPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const absolutePath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...discoverScenarioProfileStores(absolutePath));
      return;
    }
    if (PROFILE_STORE_FILE_PATTERN.test(entry.name)) {
      discovered.push(absolutePath);
    }
  });
  return discovered;
}

function loadProfilesFromStores(storePaths) {
  const profiles = [];

  storePaths.forEach((storePath) => {
    try {
      const raw = readFileSync(storePath, "utf8").replace(/^\uFEFF/, "");
      const parsed = JSON.parse(raw);
      const storeProfiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
      storeProfiles.forEach((profile) => {
        const normalized = normalizeStoreProfile(profile, storePath);
        if (normalized) {
          profiles.push(normalized);
        }
      });
    } catch {
      // Ignore malformed stores. Capture should degrade gracefully.
    }
  });

  return dedupeProfiles(profiles);
}

function normalizeStoreProfile(profile, storePath) {
  if (!profile || typeof profile !== "object") {
    return null;
  }

  const personName = normalizeOptionalString(profile.person_name || profile.name);
  if (!personName) {
    return null;
  }

  const personRef = normalizeOptionalString(profile.person_ref || profile.person_id) || personName;
  const compiledTruth = profile.compiled_truth && typeof profile.compiled_truth === "object"
    ? profile.compiled_truth
    : {};

  return {
    person_name: personName,
    person_ref: personRef,
    aliases: normalizeStringArray(profile.aliases),
    tags: normalizeStringArray(compiledTruth.tags || profile.tags),
    summary: normalizeOptionalString(compiledTruth.summary || profile.summary),
    store_path: storePath
  };
}

function dedupeProfiles(profiles) {
  const merged = new Map();

  profiles.forEach((profile) => {
    const key = buildProfileKey(profile);
    if (!merged.has(key)) {
      merged.set(key, {
        ...profile,
        aliases: [...profile.aliases],
        tags: [...profile.tags]
      });
      return;
    }

    const current = merged.get(key);
    current.aliases = normalizeStringArray([...current.aliases, ...profile.aliases]);
    current.tags = normalizeStringArray([...current.tags, ...profile.tags]);
    current.summary = current.summary || profile.summary;
  });

  return Array.from(merged.values());
}

function rankProfilesForRequest(profiles, request) {
  const sourceCorpus = request.options.auto_context_scan_sources
    ? buildSourceCorpus(request.sources)
    : "";
  const focusTokens = normalizeStringArray(request.focus_people);
  const targetTokens = normalizeStringArray(request.target_people);
  const explicitKeys = new Set(normalizeExistingPeople(request.existing_people).map(buildExistingPersonKey));

  return profiles
    .filter((profile) => !explicitKeys.has(buildProfileKey(profile)))
    .map((profile) => scoreProfileForRecall(profile, focusTokens, targetTokens, sourceCorpus))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.profile.person_name.localeCompare(right.profile.person_name, "zh-Hans-CN");
    });
}

function scoreProfileForRecall(profile, focusTokens, targetTokens, sourceCorpus) {
  let score = 0;
  const matchReasons = [];
  const profileTokens = getProfileTokens(profile);

  focusTokens.forEach((token) => {
    if (profileTokens.includes(normalizeKey(token))) {
      score += 220;
      matchReasons.push(`focus:${token}`);
    }
  });

  targetTokens.forEach((token) => {
    if (profileTokens.includes(normalizeKey(token))) {
      score += 140;
      matchReasons.push(`target:${token}`);
    }
  });

  const directMentions = countMentions(sourceCorpus, [profile.person_name]);
  if (directMentions > 0) {
    score += Math.min(120, directMentions * 40);
    matchReasons.push(`source-name:${directMentions}`);
  }

  const aliasMentions = countMentions(sourceCorpus, profile.aliases);
  if (aliasMentions > 0) {
    score += Math.min(80, aliasMentions * 20);
    matchReasons.push(`source-alias:${aliasMentions}`);
  }

  if (!score && focusTokens.length === 0 && targetTokens.length === 0 && directMentions === 0 && aliasMentions === 0) {
    return { profile, score: 0, match_reasons: [] };
  }

  return {
    profile,
    score,
    match_reasons: matchReasons
  };
}

function buildSourceCorpus(sources) {
  if (!Array.isArray(sources)) {
    return "";
  }
  return sources
    .map((source) => normalizeOptionalString(source?.content))
    .filter(Boolean)
    .join("\n");
}

function getProfileTokens(profile) {
  return [
    profile.person_name,
    profile.person_ref,
    ...profile.aliases
  ]
    .filter(shouldUseRecallToken)
    .map((item) => normalizeKey(item));
}

function countMentions(corpus, tokens) {
  if (!corpus) {
    return 0;
  }
  const normalizedCorpus = normalizeKey(corpus);
  return normalizeStringArray(tokens)
    .filter(shouldUseRecallToken)
    .reduce((total, token) => {
      const normalizedToken = normalizeKey(token);
      if (!normalizedToken || !normalizedCorpus.includes(normalizedToken)) {
        return total;
      }
      return total + (normalizedCorpus.split(normalizedToken).length - 1);
    }, 0);
}

function shouldUseRecallToken(value) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return false;
  }
  if (/^说话人\d+$/i.test(normalized)) {
    return false;
  }
  if (/^[a-z]+$/i.test(normalized) && normalized.length < 3) {
    return false;
  }
  if (normalized.length < 2) {
    return false;
  }
  return true;
}

function profileToExistingPerson(profile) {
  return {
    person_id: profile.person_ref,
    name: profile.person_name,
    aliases: profile.aliases,
    tags: profile.tags,
    summary: profile.summary
  };
}

function mergeExistingPeople(explicitPeople, autoPeople) {
  const merged = new Map();

  [...explicitPeople, ...autoPeople].forEach((person) => {
    const normalized = normalizeExistingPerson(person);
    if (!normalized) {
      return;
    }
    const key = buildExistingPersonKey(normalized);
    if (!merged.has(key)) {
      merged.set(key, normalized);
      return;
    }

    const current = merged.get(key);
    current.aliases = normalizeStringArray([...current.aliases, ...normalized.aliases]);
    current.tags = normalizeStringArray([...current.tags, ...normalized.tags]);
    current.summary = current.summary || normalized.summary;
    current.person_id = current.person_id || normalized.person_id;
  });

  return Array.from(merged.values());
}

function normalizeExistingPeople(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((person) => normalizeExistingPerson(person)).filter(Boolean);
}

function normalizeExistingPerson(person) {
  if (!person || typeof person !== "object") {
    return null;
  }

  const name = normalizeOptionalString(person.name || person.person_name);
  if (!name) {
    return null;
  }

  return {
    person_id: normalizeOptionalString(person.person_id || person.person_ref || person.id) || null,
    name,
    aliases: normalizeStringArray(person.aliases),
    tags: normalizeStringArray(person.tags),
    summary: normalizeOptionalString(person.summary),
    _score: Number(person._score || 0),
    _match_reasons: Array.isArray(person._match_reasons) ? person._match_reasons : []
  };
}

function buildIngestionReceipt(request, ingestionResult, autoContext, effectiveExistingPeople) {
  const sourceSummary = ingestionResult?.source_summary || {};
  const parsedSuccess = Array.isArray(request.sources) && request.sources.length
    ? request.sources.filter((source) => normalizeOptionalString(source?.content)).length
    : Number(sourceSummary.source_count || 0);

  return {
    accepted_sources: Array.isArray(request.sources) && request.sources.length
      ? request.sources.length
      : Number(sourceSummary.source_count || 0),
    parsed_success: parsedSuccess,
    parsed_failed: Math.max(
      0,
      (Array.isArray(request.sources) ? request.sources.length : Number(sourceSummary.source_count || 0)) - parsedSuccess
    ),
    focus_people: sourceSummary.focus_people || request.focus_people || [],
    target_people: sourceSummary.target_people || request.target_people || [],
    existing_people_count: Number(
      ingestionResult?.policy?.metrics?.existing_people_count ?? effectiveExistingPeople.length
    ),
    auto_context_applied: Boolean(autoContext?.applied),
    auto_context_added_count: Number(autoContext?.added_count || 0),
    auto_context_matched_people: Array.isArray(autoContext?.matched_people) ? autoContext.matched_people : [],
    auto_context_store_count: Array.isArray(autoContext?.store_paths) ? autoContext.store_paths.length : 0
  };
}

function buildCommitReceipt(request, reviewResult) {
  return {
    reviewed_candidates: Array.isArray(request.review_decisions) ? request.review_decisions.length : 0,
    operator: request.operator || "",
    written: Boolean(reviewResult?.profile_store_delta?.written),
    profile_store_path: reviewResult?.profile_store_delta?.store_path || request.profile_store_path || "",
    view_store_path: request.view_store_path || defaultViewStorePath,
    remaining_unresolved: Number(reviewResult?.review_summary?.unresolved_count || 0)
  };
}

function buildProcessingFeedbackFromIngestion(ingestionResult) {
  const resolvedPeople = Array.isArray(ingestionResult?.resolved_people) ? ingestionResult.resolved_people : [];
  const detectedPeople = Array.isArray(ingestionResult?.detected_people) ? ingestionResult.detected_people : [];
  const reviewBundle = ingestionResult?.review_bundle && typeof ingestionResult.review_bundle === "object"
    ? ingestionResult.review_bundle
    : { candidates: [] };
  const candidates = Array.isArray(reviewBundle.candidates) ? reviewBundle.candidates : [];

  return {
    detected_people_count: detectedPeople.length,
    updated_people_count: resolvedPeople.filter((person) => person?.resolution_action === "update").length,
    new_candidate_count: resolvedPeople.filter((person) => person?.resolution_action === "create").length,
    ignored_noise_count: resolvedPeople.filter((person) => person?.resolution_action === "ignore").length,
    review_pending_count: Number(
      reviewBundle.pending_count || candidates.filter((candidate) => candidate?.needs_confirmation).length
    ),
    highlights: buildHighlightsFromIngestion(ingestionResult)
  };
}

function buildHighlightsFromIngestion(ingestionResult) {
  const resolvedPeople = Array.isArray(ingestionResult?.resolved_people) ? ingestionResult.resolved_people : [];
  const personProfiles = Array.isArray(ingestionResult?.person_profiles) ? ingestionResult.person_profiles : [];
  const highlights = [];

  resolvedPeople
    .filter((person) => person?.resolution_action === "update")
    .slice(0, 2)
    .forEach((person) => {
      highlights.push(`已识别并建议更新 ${person.person_name}`);
    });

  resolvedPeople
    .filter((person) => person?.resolution_action === "create")
    .slice(0, 2)
    .forEach((person) => {
      highlights.push(`发现新的建档候选人 ${person.person_name}`);
    });

  if (!highlights.length) {
    personProfiles.slice(0, 3).forEach((profile) => {
      const summary = normalizeOptionalString(profile?.compiled_truth?.summary)
        || normalizeOptionalString(profile?.compiled_truth?.current_judgment);
      if (summary) {
        highlights.push(`${profile.person_name}: ${summary}`);
      }
    });
  }

  return highlights.slice(0, 3);
}

function buildConfirmationRequestFromIngestion(ingestionResult) {
  const reviewBundle = ingestionResult?.review_bundle && typeof ingestionResult.review_bundle === "object"
    ? ingestionResult.review_bundle
    : { candidates: [] };
  const candidates = Array.isArray(reviewBundle.candidates) ? reviewBundle.candidates : [];
  const pendingCount = Number(reviewBundle.pending_count || candidates.filter((candidate) => candidate?.needs_confirmation).length);
  const topCandidates = candidates
    .slice()
    .sort((left, right) => comparePriority(left?.priority, right?.priority))
    .slice(0, 3)
    .map((candidate) => ({
      person_name: candidate?.person_name || "",
      suggested_action: candidate?.suggested_action || "",
      priority: candidate?.priority || "medium",
      needs_confirmation: Boolean(candidate?.needs_confirmation),
      questions: Array.isArray(candidate?.questions) ? candidate.questions : [],
      fields_to_confirm: Array.isArray(candidate?.fields_to_confirm) ? candidate.fields_to_confirm : [],
      evidence_preview: Array.isArray(candidate?.evidence_preview) ? candidate.evidence_preview : []
    }));

  return {
    required: Boolean(reviewBundle.confirmation_required || pendingCount > 0),
    pending_count: pendingCount,
    required_candidate_count: Number(
      reviewBundle.required_candidate_count || topCandidates.filter((item) => item.needs_confirmation).length
    ),
    top_candidates: topCandidates,
    message: pendingCount > 0
      ? `这次识别后有 ${pendingCount} 位关系人建议你先确认，再写回档案。`
      : "这次资料已完成自动识别，当前没有必须人工确认的关系人。"
  };
}

function buildCommitFeedback(reviewResult) {
  return {
    committed_count: Number(reviewResult?.review_summary?.committed_count || 0),
    created_count: Number(reviewResult?.review_summary?.created_count || 0),
    updated_count: Number(reviewResult?.review_summary?.updated_count || 0),
    ignored_count: Number(reviewResult?.review_summary?.ignored_count || 0),
    deferred_count: Number(reviewResult?.review_summary?.deferred_count || 0),
    unresolved_count: Number(reviewResult?.review_summary?.unresolved_count || 0),
    created_people: mapNames(reviewResult?.created_people),
    updated_people: mapNames(reviewResult?.updated_people),
    ignored_people: mapNames(reviewResult?.ignored_people),
    deferred_people: mapNames(reviewResult?.deferred_people)
  };
}

function buildConfirmationRequestAfterCommit(reviewResult) {
  const unresolved = Array.isArray(reviewResult?.unresolved_candidates) ? reviewResult.unresolved_candidates : [];
  return {
    required: unresolved.length > 0,
    pending_count: unresolved.length,
    required_candidate_count: unresolved.length,
    top_candidates: unresolved.slice(0, 3).map((candidate) => ({
      person_name: candidate?.person_name || "",
      suggested_action: candidate?.suggested_action || "review",
      priority: "medium",
      needs_confirmation: true,
      questions: candidate?.reason ? [candidate.reason] : [],
      fields_to_confirm: [],
      evidence_preview: []
    })),
    message: unresolved.length
      ? `还有 ${unresolved.length} 位关系人暂未确认，建议继续 review。`
      : "本轮确认结果已完成提交。"
  };
}

function buildNextActionForIngestion(confirmationRequest, processingFeedback) {
  if (confirmationRequest.required) {
    return {
      type: "review",
      message: `请优先确认 ${confirmationRequest.pending_count} 位候选关系人，再继续写回档案。`
    };
  }

  if (processingFeedback.updated_people_count || processingFeedback.new_candidate_count) {
    return {
      type: "commit",
      message: "当前结果已经足够进入写回阶段，可以继续提交关系档案。"
    };
  }

  return {
    type: "capture_more",
    message: "这次资料的信息量偏弱，建议补充更多互动记录或明确重点关注人物。"
  };
}

function buildNextActionForCommit(reviewResult, viewRefreshResult) {
  const unresolvedCount = Number(reviewResult?.review_summary?.unresolved_count || 0);
  if (unresolvedCount > 0) {
    return {
      type: "review_remaining",
      message: `本轮已提交一部分结果，但还有 ${unresolvedCount} 位关系人建议继续确认。`
    };
  }

  const refreshedCount = Number(viewRefreshResult?.refreshed_count || 0);
  if (refreshedCount > 0) {
    return {
      type: "inspect_views",
      message: `本轮已同步刷新 ${refreshedCount} 份持续视图，可以直接查看 markdown 视图或继续生成 briefing。`
    };
  }

  return {
    type: "complete",
    message: "本轮关系人档案已经完成写回，可以继续查看档案或生成 briefing。"
  };
}

function buildUserFeedbackForIngestion(processingFeedback, confirmationRequest, autoContext) {
  const headline = confirmationRequest.required
    ? `已完成资料整理，并识别出 ${confirmationRequest.pending_count} 位待确认关系人`
    : `已完成资料整理，并更新了 ${processingFeedback.updated_people_count} 位关系人`;

  const summaryLines = [
    `识别到 ${processingFeedback.detected_people_count} 位人物`,
    `建议更新 ${processingFeedback.updated_people_count} 位已有关系人`,
    `发现 ${processingFeedback.new_candidate_count} 位新候选人`,
    confirmationRequest.required
      ? `当前需要你确认 ${confirmationRequest.pending_count} 位关系人`
      : "当前没有必须人工确认的关系人"
  ];

  if (autoContext?.applied) {
    summaryLines.push(`已自动补充 ${autoContext.added_count} 位既有关系人上下文`);
  }

  return {
    headline,
    summary_lines: summaryLines,
    highlights: Array.isArray(processingFeedback.highlights) ? processingFeedback.highlights : []
  };
}

function buildUserFeedbackForCommit(reviewResult, viewRefreshResult) {
  const summary = reviewResult?.review_summary || {};
  const headline = summary.unresolved_count > 0
    ? `本轮已提交 ${summary.committed_count || 0} 位关系人，但还有 ${summary.unresolved_count || 0} 位待继续确认`
    : `本轮已完成关系人档案提交，共提交 ${summary.committed_count || 0} 位`;
  const refreshedCount = Number(viewRefreshResult?.refreshed_count || 0);

  return {
    headline,
    summary_lines: [
      `新建 ${summary.created_count || 0} 位`,
      `更新 ${summary.updated_count || 0} 位`,
      `忽略 ${summary.ignored_count || 0} 位`,
      `暂缓 ${summary.deferred_count || 0} 位`,
      refreshedCount > 0 ? `已刷新 ${refreshedCount} 份持续视图` : "本轮未刷新持续视图"
    ],
    highlights: [
      ...mapNames(reviewResult?.created_people).map((name) => `已新建 ${name}`),
      ...mapNames(reviewResult?.updated_people).map((name) => `已更新 ${name}`),
      ...mapViewNames(viewRefreshResult).map((name) => `已刷新视图 ${name}`)
    ].slice(0, 4)
  };
}

function comparePriority(left, right) {
  return (PRIORITY_ORDER[left || "medium"] ?? 1) - (PRIORITY_ORDER[right || "medium"] ?? 1);
}

function mapNames(items) {
  return Array.isArray(items)
    ? items.map((item) => item?.person_name).filter(Boolean)
    : [];
}

function mapViewNames(viewRefreshResult) {
  return Array.isArray(viewRefreshResult?.refreshed_views)
    ? viewRefreshResult.refreshed_views.map((item) => item?.person_name).filter(Boolean)
    : [];
}

function buildExistingPersonKey(person) {
  if (person?.person_id) {
    return normalizeKey(person.person_id);
  }
  return normalizeKey(person?.name);
}

function buildProfileKey(profile) {
  return normalizeKey(profile.person_ref || profile.person_name);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => normalizeOptionalString(item)).filter(Boolean))];
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeKey(value) {
  return normalizeOptionalString(String(value ?? "")).toLowerCase();
}

export const __capture_internal = {
  validateCaptureRequest,
  deriveAutoContext,
  discoverProfileStorePaths,
  loadProfilesFromStores,
  rankProfilesForRequest,
  mergeExistingPeople,
  shouldUseRecallToken
};

export function renderRelationshipCaptureSummaryMarkdown(result, options = {}) {
  const captureResult = result && typeof result === "object" ? result : {};
  const stage = normalizeOptionalString(captureResult.stage) || "ingestion";
  const title = normalizeOptionalString(options.title)
    || normalizeOptionalString(captureResult.notes)
    || "Relationship Capture Summary";

  const lines = [
    `# ${title} - ${stage === "commit" ? "提交摘要" : "导入摘要"}`,
    "",
    "## 处理状态",
    `- 当前状态：${normalizeOptionalString(captureResult.status) || "unknown"}`,
    `- 用户反馈：${normalizeOptionalString(captureResult.user_feedback?.headline) || "无"}`,
    `- 下一步：${normalizeOptionalString(captureResult.next_action?.message) || "无"}`,
    ""
  ];

  if (stage === "commit") {
    appendCommitSummary(lines, captureResult);
  } else {
    appendIngestionSummary(lines, captureResult);
  }

  appendReceiptSummary(lines, captureResult);
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function appendIngestionSummary(lines, captureResult) {
  const processing = captureResult.processing_feedback || {};
  const confirmation = captureResult.confirmation_request || {};
  const highlights = Array.isArray(captureResult.user_feedback?.highlights)
    ? captureResult.user_feedback.highlights
    : [];
  const candidates = Array.isArray(confirmation.top_candidates) ? confirmation.top_candidates : [];

  lines.push("## 处理结果");
  lines.push(`- 识别到 ${Number(processing.detected_people_count || 0)} 位人物`);
  lines.push(`- 建议更新 ${Number(processing.updated_people_count || 0)} 位已有关系人`);
  lines.push(`- 发现 ${Number(processing.new_candidate_count || 0)} 位新候选人`);
  lines.push(`- 当前需要确认 ${Number(confirmation.pending_count || 0)} 位关系人`);
  if (Number(captureResult.receipt?.auto_context_added_count || 0) > 0) {
    lines.push(`- 已自动补充 ${Number(captureResult.receipt.auto_context_added_count)} 位既有关系人上下文`);
  }
  lines.push("");

  if (highlights.length) {
    lines.push("## 重点发现");
    highlights.forEach((item) => lines.push(`- ${item}`));
    lines.push("");
  }

  if (candidates.length) {
    lines.push("## 待确认关系人");
    candidates.forEach((candidate) => {
      lines.push(`### ${normalizeOptionalString(candidate.person_name) || "未命名人物"}`);
      lines.push(`- 建议动作：${normalizeOptionalString(candidate.suggested_action) || "review"}`);
      lines.push(`- 优先级：${normalizeOptionalString(candidate.priority) || "medium"}`);
      lines.push(`- 是否必须确认：${candidate.needs_confirmation ? "是" : "否"}`);
      const questions = Array.isArray(candidate.questions) ? candidate.questions.filter(Boolean) : [];
      if (questions.length) {
        lines.push("- 需要关注的问题：");
        questions.forEach((question) => lines.push(`  - ${question}`));
      }
      const evidencePreview = Array.isArray(candidate.evidence_preview)
        ? candidate.evidence_preview.filter(Boolean)
        : [];
      if (evidencePreview.length) {
        lines.push("- 证据预览：");
        evidencePreview.forEach((item) => lines.push(`  - ${item}`));
      }
      lines.push("");
    });
  }
}

function appendCommitSummary(lines, captureResult) {
  const commitFeedback = captureResult.commit_feedback || {};
  const viewRefresh = captureResult.view_refresh_result || {};
  const unresolved = captureResult.confirmation_request || {};
  const updatedPeople = Array.isArray(commitFeedback.updated_people) ? commitFeedback.updated_people : [];
  const createdPeople = Array.isArray(commitFeedback.created_people) ? commitFeedback.created_people : [];
  const ignoredPeople = Array.isArray(commitFeedback.ignored_people) ? commitFeedback.ignored_people : [];
  const deferredPeople = Array.isArray(commitFeedback.deferred_people) ? commitFeedback.deferred_people : [];
  const refreshedViews = Array.isArray(viewRefresh.refreshed_views) ? viewRefresh.refreshed_views : [];

  lines.push("## 提交结果");
  lines.push(`- 新建 ${Number(commitFeedback.created_count || 0)} 位`);
  lines.push(`- 更新 ${Number(commitFeedback.updated_count || 0)} 位`);
  lines.push(`- 忽略 ${Number(commitFeedback.ignored_count || 0)} 位`);
  lines.push(`- 暂缓 ${Number(commitFeedback.deferred_count || 0)} 位`);
  lines.push(`- 剩余待确认 ${Number(commitFeedback.unresolved_count || 0)} 位`);
  lines.push(`- 已刷新 ${Number(viewRefresh.refreshed_count || 0)} 份持续视图`);
  lines.push("");

  if (updatedPeople.length || createdPeople.length || ignoredPeople.length || deferredPeople.length) {
    lines.push("## 本轮变更");
    if (updatedPeople.length) {
      lines.push(`- 已更新：${updatedPeople.join("、")}`);
    }
    if (createdPeople.length) {
      lines.push(`- 已新建：${createdPeople.join("、")}`);
    }
    if (ignoredPeople.length) {
      lines.push(`- 已忽略：${ignoredPeople.join("、")}`);
    }
    if (deferredPeople.length) {
      lines.push(`- 已暂缓：${deferredPeople.join("、")}`);
    }
    lines.push("");
  }

  if (refreshedViews.length) {
    lines.push("## 已刷新视图");
    refreshedViews.forEach((view) => {
      const personName = normalizeOptionalString(view.person_name) || "未命名人物";
      const markdownPath = normalizeOptionalString(view.markdown_path);
      lines.push(`- ${personName}${markdownPath ? `：${markdownPath}` : ""}`);
    });
    lines.push("");
  }

  const topCandidates = Array.isArray(unresolved.top_candidates) ? unresolved.top_candidates : [];
  if (topCandidates.length) {
    lines.push("## 仍待确认");
    topCandidates.forEach((candidate) => {
      const personName = normalizeOptionalString(candidate.person_name) || "未命名人物";
      lines.push(`### ${personName}`);
      lines.push(`- 建议动作：${normalizeOptionalString(candidate.suggested_action) || "review"}`);
      const questions = Array.isArray(candidate.questions) ? candidate.questions.filter(Boolean) : [];
      if (questions.length) {
        lines.push("- 原因：");
        questions.forEach((question) => lines.push(`  - ${question}`));
      }
      lines.push("");
    });
  }
}

function appendReceiptSummary(lines, captureResult) {
  const receipt = captureResult.receipt || {};
  const stage = normalizeOptionalString(captureResult.stage) || "ingestion";

  lines.push("## 执行信息");
  if (stage === "commit") {
    lines.push(`- 已审阅候选：${Number(receipt.reviewed_candidates || 0)}`);
    lines.push(`- 写回档案：${receipt.written ? "是" : "否"}`);
    if (normalizeOptionalString(receipt.profile_store_path)) {
      lines.push(`- Profile Store：${receipt.profile_store_path}`);
    }
  } else {
    lines.push(`- 接收资料数：${Number(receipt.accepted_sources || 0)}`);
    lines.push(`- 解析成功：${Number(receipt.parsed_success || 0)}`);
    lines.push(`- 解析失败：${Number(receipt.parsed_failed || 0)}`);
    if (Array.isArray(receipt.focus_people) && receipt.focus_people.length) {
      lines.push(`- 重点关注人：${receipt.focus_people.join("、")}`);
    }
    if (Array.isArray(receipt.target_people) && receipt.target_people.length) {
      lines.push(`- 目标人物：${receipt.target_people.join("、")}`);
    }
  }
}

