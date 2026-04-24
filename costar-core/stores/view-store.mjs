// SPDX-License-Identifier: Apache-2.0
import { readJsonStore, resolveStorePath, writeJsonStore, normalizeString } from "./json-store-utils.mjs";

export function createEmptyViewStore(version = "0.1.0") {
  return {
    version,
    updated_at: "",
    profile_store_path: "",
    graph_review_store_path: "",
    views: []
  };
}

export function loadViewStore({ storePath, defaultStorePath, version = "0.1.0" }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const parsed = readJsonStore(targetPath, () => createEmptyViewStore(version));
  return {
    store_path: targetPath,
    version: normalizeString(parsed.version) || version,
    updated_at: normalizeString(parsed.updated_at),
    profile_store_path: normalizeString(parsed.profile_store_path),
    graph_review_store_path: normalizeString(parsed.graph_review_store_path),
    views: Array.isArray(parsed.views) ? parsed.views : []
  };
}

export function writeViewStore({ storePath, defaultStorePath, store }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  writeJsonStore(targetPath, store);
  return {
    store,
    store_path: targetPath,
    written: true,
    total_views_after_write: Array.isArray(store?.views) ? store.views.length : 0
  };
}
