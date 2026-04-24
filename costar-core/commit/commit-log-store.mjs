// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import {
  normalizeString,
  readJsonStore,
  resolveStorePath,
  writeJsonStore
} from "../stores/json-store-utils.mjs";

const COMMIT_LOG_VERSION = "0.1.0";
const DEFAULT_LOG_NAME = "costar-commit-log.json";

export function resolveCommitLogPath({ target, commitRequest, commitLogPath, defaultRoot }) {
  const explicit = resolveStorePath(commitLogPath, "");
  if (explicit) {
    return explicit;
  }

  const profileStorePath = normalizeString(commitRequest?.profile_store_path);
  if (target === "profile_review" && profileStorePath) {
    return path.join(path.dirname(profileStorePath), DEFAULT_LOG_NAME);
  }

  const graphStorePath = normalizeString(commitRequest?.graph_review_store_path);
  if (target === "graph_review" && graphStorePath) {
    return path.join(path.dirname(graphStorePath), DEFAULT_LOG_NAME);
  }

  return path.join(defaultRoot, "stores", DEFAULT_LOG_NAME);
}

export function loadCommitLog(logPath) {
  const payload = readJsonStore(logPath, () => ({
    version: COMMIT_LOG_VERSION,
    updated_at: "",
    entries: []
  }));

  return {
    version: normalizeString(payload.version) || COMMIT_LOG_VERSION,
    updated_at: normalizeString(payload.updated_at),
    entries: Array.isArray(payload.entries)
      ? payload.entries
          .filter((entry) => entry && typeof entry === "object")
          .map((entry) => ({
            commit_id: normalizeString(entry.commit_id),
            target: normalizeString(entry.target),
            fingerprint: normalizeString(entry.fingerprint),
            stored_at: normalizeString(entry.stored_at),
            result: entry.result && typeof entry.result === "object" ? entry.result : null
          }))
          .filter((entry) => entry.commit_id && entry.target && entry.fingerprint && entry.result)
      : []
  };
}

export function writeCommitLog(logPath, log, processedAt) {
  const payload = {
    version: COMMIT_LOG_VERSION,
    updated_at: processedAt,
    entries: Array.isArray(log.entries) ? log.entries : []
  };
  writeJsonStore(logPath, payload);
  return {
    log_path: logPath,
    written: true,
    entry_count: payload.entries.length,
    updated_at: processedAt
  };
}

export function findCommitLogEntry(log, commitId, target) {
  const normalizedCommitId = normalizeString(commitId);
  const normalizedTarget = normalizeString(target);
  return (
    log.entries.find(
      (entry) => entry.commit_id === normalizedCommitId && entry.target === normalizedTarget
    ) || null
  );
}

export function upsertCommitLogEntry(log, entry) {
  const nextEntries = Array.isArray(log.entries) ? [...log.entries] : [];
  const index = nextEntries.findIndex(
    (item) => item.commit_id === entry.commit_id && item.target === entry.target
  );

  if (index >= 0) {
    nextEntries[index] = entry;
  } else {
    nextEntries.push(entry);
  }

  return {
    ...log,
    entries: nextEntries
  };
}

export function stableFingerprint(value) {
  return stableStringify(value);
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}
