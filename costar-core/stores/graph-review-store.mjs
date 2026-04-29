// SPDX-License-Identifier: Apache-2.0
import { readJsonStore, resolveStorePath, writeJsonStore, normalizeString } from "./json-store-utils.mjs";

export function createEmptyGraphReviewStore(version = "0.1.0") {
  return {
    version,
    updated_at: "",
    decisions: []
  };
}

export function loadGraphReviewStore({ storePath, defaultStorePath, version = "0.1.0", normalizeDecision }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const parsed = readJsonStore(targetPath, () => createEmptyGraphReviewStore(version));
  const decisionNormalizer = typeof normalizeDecision === "function" ? normalizeDecision : (decision) => decision;
  return {
    store_path: targetPath,
    version: normalizeString(parsed.version) || version,
    updated_at: normalizeString(parsed.updated_at),
    decisions: Array.isArray(parsed.decisions)
      ? parsed.decisions.map((decision) => decisionNormalizer(decision))
      : []
  };
}

export function writeGraphReviewStore({ storePath, defaultStorePath, store }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  writeJsonStore(targetPath, store);
  return {
    store,
    store_path: targetPath,
    written: true,
    total_decisions_after_write: Array.isArray(store?.decisions) ? store.decisions.length : 0
  };
}
