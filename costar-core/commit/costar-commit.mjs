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
  } else {
    const info = getRelationshipGraphReviewResolutionSkillInfo();
    result = runRelationshipGraphReviewResolution({
      skill: info.skill,
      version: info.version,
      ...request.commit_request
    });
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
    throw new Error("costar-commit requires target: profile_review | graph_review.");
  }

  const commitRequest = payload.commit_request;
  if (!commitRequest || typeof commitRequest !== "object" || Array.isArray(commitRequest)) {
    throw new Error("costar-commit requires commit_request as a JSON object.");
  }

  return {
    target,
    commit_request: commitRequest,
    commit_id: normalizeOptionalString(payload.commit_id),
    commit_log_path: normalizeOptionalString(payload.commit_log_path)
  };
}

function normalizeCommitTarget(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized in COMMIT_TARGETS) {
    return normalized;
  }
  return null;
}

function normalizeOptionalString(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
