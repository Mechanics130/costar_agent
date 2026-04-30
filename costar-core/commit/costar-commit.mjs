// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getRelationshipReviewResolutionSkillInfo,
  runRelationshipReviewResolution
} from "../../relationship-ingestion/runtime/relationship-review-resolution.mjs";
import {
  getRelationshipGraphReviewResolutionSkillInfo,
  runRelationshipGraphReviewResolution
} from "../../relationship-graph/runtime/relationship-graph-review-resolution.mjs";
import {
  findCommitLogEntry,
  loadCommitLog,
  resolveCommitLogPath,
  stableFingerprint,
  upsertCommitLogEntry,
  writeCommitLog
} from "./commit-log-store.mjs";
import { commitMemoryReviewDecisions } from "../memory/memory-commit.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coreRoot = path.resolve(__dirname, "..");

const COMMIT_TARGETS = {
  profile_review: {
    target: "profile_review",
    skill: "relationship-review-resolution"
  },
  graph_review: {
    target: "graph_review",
    skill: "relationship-graph-review-resolution"
  },
  memory_review: {
    target: "memory_review",
    skill: "costar-memory-review"
  }
};

export function getCoStarCommitInfo() {
  return {
    layer: "costar-core-commit",
    version: "0.1.0",
    core_root: coreRoot,
    writable_targets: listWritableCommitTargets()
  };
}

export function listWritableCommitTargets() {
  return Object.values(COMMIT_TARGETS).map((item) => ({ ...item }));
}

export function runCoStarCommit(payload) {
  const request = validateCommitRequest(payload);
  const processedAt = new Date().toISOString();
  const logPath = resolveCommitLogPath({
    target: request.target,
    commitRequest: request.commit_request,
    commitLogPath: request.commit_log_path,
    defaultRoot: coreRoot
  });
  const fingerprint = stableFingerprint({
    target: request.target,
    commit_request: request.commit_request
  });

  if (request.commit_id) {
    const log = loadCommitLog(logPath);
    const existing = findCommitLogEntry(log, request.commit_id, request.target);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error(
          `commit_id ${request.commit_id} was already used for a different ${request.target} payload.`
        );
      }
      return {
        ...clone(existing.result),
        commit_id: request.commit_id,
        is_replay: true,
        replay_log_path: logPath
      };
    }
  }

  let result;
  if (request.target === "profile_review") {
    const info = getRelationshipReviewResolutionSkillInfo();
    result = runRelationshipReviewResolution({
      skill: info.skill,
      version: info.version,
      ...request.commit_request
    });
  } else if (request.target === "graph_review") {
    const info = getRelationshipGraphReviewResolutionSkillInfo();
    result = runRelationshipGraphReviewResolution({
      skill: info.skill,
      version: info.version,
      ...request.commit_request
    });
  } else {
    result = commitMemoryReviewDecisions(request.commit_request);
  }

  const finalized = {
    ...result,
    commit_id: request.commit_id || null,
    is_replay: false
  };

  if (request.commit_id) {
    const nextLog = upsertCommitLogEntry(loadCommitLog(logPath), {
      commit_id: request.commit_id,
      target: request.target,
      fingerprint,
      stored_at: processedAt,
      result: clone(finalized)
    });
    const logWrite = writeCommitLog(logPath, nextLog, processedAt);
    return {
      ...finalized,
      commit_log: logWrite
    };
  }

  return finalized;
}

function validateCommitRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("costar-commit request must be a JSON object.");
  }

  const target = normalizeCommitTarget(payload.target);
  if (!target) {
    throw new Error("costar-commit requires target: profile_review | graph_review | memory_review.");
  }

  const rawCommitRequest = payload.commit_request;
  if (!rawCommitRequest || typeof rawCommitRequest !== "object" || Array.isArray(rawCommitRequest)) {
    throw new Error("costar-commit requires commit_request as a JSON object.");
  }
  const commitRequest = normalizeCommitRequestForTarget(target, rawCommitRequest);

  return {
    target,
    commit_request: commitRequest,
    commit_id: normalizeOptionalString(payload.commit_id),
    commit_log_path: normalizeOptionalString(payload.commit_log_path)
  };
}

function normalizeCommitRequestForTarget(target, commitRequest) {
  const normalized = { ...commitRequest };

  if (target === "profile_review") {
    normalized.ingestion_result = normalizeProfileIngestionResult(normalized.ingestion_result);
    normalized.review_decisions = normalizeReviewDecisionsAlias({
      reviewDecisions: normalized.review_decisions,
      decisions: normalized.decisions,
      target
    });
    return normalized;
  }

  if (target === "memory_review") {
    normalized.memory_store_path = normalizeOptionalString(normalized.memory_store_path || normalized.store_path);
    if (!normalized.memory_store_path) {
      throw new Error("memory_review commit_request requires memory_store_path.");
    }
    normalized.source_refs = normalizeObjectArray(normalized.source_refs);
    normalized.candidates = normalizeObjectArray(normalized.candidates);
    normalized.review_decisions = normalizeReviewDecisionsAlias({
      reviewDecisions: normalized.review_decisions,
      decisions: normalized.decisions,
      target
    });
    return normalized;
  }

  normalized.graph_result = normalizeGraphResult(normalized.graph_result);
  normalized.review_decisions = normalizeReviewDecisionsAlias({
    reviewDecisions: normalized.review_decisions,
    decisions: normalized.decisions,
    target
  });
  return normalized;
}

function normalizeProfileIngestionResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "profile_review commit_request requires ingestion_result. If you used capture_ingest_sources, pass capture_result.ingestion_result or the full capture response."
    );
  }

  const candidate = unwrapNestedResult(value, "ingestion_result");
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("profile_review commit_request.ingestion_result must be a JSON object.");
  }

  if (candidate.skill === "relationship-ingestion") {
    return candidate;
  }

  if (candidate.skill === "relationship-capture") {
    throw new Error(
      "profile_review commit_request.ingestion_result is a capture response without a nested ingestion_result. Pass capture_result.ingestion_result."
    );
  }

  if (looksLikeIngestionResult(candidate)) {
    return {
      ...candidate,
      skill: "relationship-ingestion"
    };
  }

  throw new Error(
    "profile_review commit_request.ingestion_result must be a relationship-ingestion result or a capture_ingest_sources response containing ingestion_result."
  );
}

function normalizeGraphResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("graph_review commit_request requires graph_result.");
  }

  const candidate = unwrapNestedResult(value, "graph_result");
  if (candidate?.skill === "relationship-graph") {
    return candidate;
  }

  if (looksLikeGraphResult(candidate)) {
    return {
      ...candidate,
      skill: "relationship-graph"
    };
  }

  throw new Error("graph_review commit_request.graph_result must be a relationship-graph result.");
}

function unwrapNestedResult(value, nestedKey) {
  if (value?.[nestedKey] && typeof value[nestedKey] === "object" && !Array.isArray(value[nestedKey])) {
    return value[nestedKey];
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

function looksLikeGraphResult(value) {
  return Boolean(
    value
      && typeof value === "object"
      && (
        value.graph
        || Array.isArray(value.review_bundle?.edge_candidates)
        || Array.isArray(value.related_people)
      )
  );
}

function normalizeReviewDecisionsAlias({ reviewDecisions, decisions, target }) {
  if (Array.isArray(reviewDecisions)) {
    return reviewDecisions;
  }
  if (Array.isArray(decisions)) {
    return decisions;
  }
  if (reviewDecisions == null && decisions == null) {
    return [];
  }
  throw new Error(`${target} commit_request.review_decisions must be an array. Alias decisions is also accepted.`);
}

function normalizeCommitTarget(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized in COMMIT_TARGETS) {
    return normalized;
  }
  return null;
}

function normalizeObjectArray(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
