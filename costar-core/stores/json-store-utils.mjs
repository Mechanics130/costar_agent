// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function resolveStorePath(storePath, defaultStorePath) {
  return normalizeString(storePath) || normalizeString(defaultStorePath) || "";
}

export function ensureStoreDirectory(targetPath) {
  const directory = path.dirname(targetPath);
  mkdirSync(directory, { recursive: true });
}

export function readJsonStore(targetPath, createFallback) {
  if (!targetPath || !existsSync(targetPath)) {
    return typeof createFallback === "function" ? createFallback() : {};
  }

  const raw = readFileSync(targetPath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

export function writeJsonStore(targetPath, payload) {
  ensureStoreDirectory(targetPath);
  writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function normalizeString(value) {
  return String(value ?? "").trim();
}
