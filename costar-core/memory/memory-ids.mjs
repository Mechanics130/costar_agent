// SPDX-License-Identifier: Apache-2.0

export function stableMemoryId(prefix, parts) {
  const body = (Array.isArray(parts) ? parts : [parts])
    .map((part) => normalizeIdPart(part))
    .filter(Boolean)
    .join("-");
  return `${normalizeIdPart(prefix) || "mem"}_${body || "unknown"}`;
}

export function normalizeIdPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
