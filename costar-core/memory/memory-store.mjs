// SPDX-License-Identifier: Apache-2.0
import {
  normalizeString,
  readJsonStore,
  resolveStorePath,
  writeJsonStore
} from "../stores/json-store-utils.mjs";

export const MEMORY_STORE_VERSION = "0.3.0";

export function createEmptyMemoryStore(version = MEMORY_STORE_VERSION) {
  return {
    version,
    updated_at: "",
    sources: [],
    entities: [],
    candidates: [],
    facts: [],
    interactions: [],
    relationships: [],
    artifacts: []
  };
}

export function loadMemoryStore({ storePath, defaultStorePath = "" }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const parsed = readJsonStore(targetPath, () => createEmptyMemoryStore());
  return normalizeMemoryStore(parsed, targetPath);
}

export function writeMemoryStore({ storePath, defaultStorePath = "", store, processedAt = "" }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const normalized = normalizeMemoryStore({
    ...store,
    updated_at: processedAt || store?.updated_at || new Date().toISOString()
  }, targetPath);
  const { store_path: _storePath, ...payload } = normalized;
  writeJsonStore(targetPath, payload);
  return {
    store: payload,
    store_path: targetPath,
    written: true,
    counts: countMemoryRecords(payload)
  };
}

export function normalizeMemoryStore(value, storePath = "") {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : createEmptyMemoryStore();
  return {
    store_path: storePath,
    version: normalizeString(source.version) || MEMORY_STORE_VERSION,
    updated_at: normalizeString(source.updated_at),
    sources: normalizeObjectArray(source.sources),
    entities: normalizeObjectArray(source.entities),
    candidates: normalizeObjectArray(source.candidates),
    facts: normalizeObjectArray(source.facts),
    interactions: normalizeObjectArray(source.interactions),
    relationships: normalizeObjectArray(source.relationships),
    artifacts: normalizeObjectArray(source.artifacts)
  };
}

export function countMemoryRecords(store) {
  return {
    sources: normalizeObjectArray(store?.sources).length,
    entities: normalizeObjectArray(store?.entities).length,
    candidates: normalizeObjectArray(store?.candidates).length,
    facts: normalizeObjectArray(store?.facts).length,
    interactions: normalizeObjectArray(store?.interactions).length,
    relationships: normalizeObjectArray(store?.relationships).length,
    artifacts: normalizeObjectArray(store?.artifacts).length
  };
}

function normalizeObjectArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item))
    : [];
}
