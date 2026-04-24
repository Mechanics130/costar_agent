// SPDX-License-Identifier: Apache-2.0
import { readJsonStore, resolveStorePath, writeJsonStore, normalizeString } from "./json-store-utils.mjs";

export function createEmptyProfileStore(version = "0.1.0") {
  return {
    version,
    updated_at: "",
    profiles: []
  };
}

export function loadProfileStore({ storePath, defaultStorePath, version = "0.1.0", normalizeProfile }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const parsed = readJsonStore(targetPath, () => createEmptyProfileStore(version));
  const profileNormalizer = typeof normalizeProfile === "function" ? normalizeProfile : (profile) => profile;
  return {
    store_path: targetPath,
    version: normalizeString(parsed.version) || version,
    updated_at: normalizeString(parsed.updated_at),
    profiles: Array.isArray(parsed.profiles)
      ? parsed.profiles.map((profile) => profileNormalizer(profile))
      : []
  };
}

export function writeProfileStore({ storePath, defaultStorePath, version = "0.1.0", profiles, processedAt, normalizeProfile }) {
  const targetPath = resolveStorePath(storePath, defaultStorePath);
  const profileNormalizer = typeof normalizeProfile === "function" ? normalizeProfile : (profile) => profile;
  const normalizedProfiles = Array.isArray(profiles)
    ? profiles.map((profile) => profileNormalizer(profile))
    : [];

  const store = {
    version,
    updated_at: processedAt,
    profiles: normalizedProfiles
  };
  writeJsonStore(targetPath, store);
  return {
    store,
    store_path: targetPath,
    written: true,
    total_profiles_after_write: normalizedProfiles.length
  };
}
