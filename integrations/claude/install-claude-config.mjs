#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const bundleRoot = path.dirname(__filename);
const embeddedRepoRoot = "__COSTAR_REPO_ROOT__";
const repoRoot = embeddedRepoRoot.startsWith("__COSTAR_")
  ? path.resolve(bundleRoot, "..", "..")
  : embeddedRepoRoot;

const args = process.argv.slice(2);
const { applyClaudeConfig } = await import(pathToFileURL(path.join(repoRoot, "costar-core", "host-install", "host-installer.mjs")).href);

const result = applyClaudeConfig({
  repoRoot: parseFlag("--repo-root", repoRoot),
  bundleDir: parseFlag("--bundle-root", bundleRoot),
  mode: parseFlag("--mode", "both"),
  desktopConfigPath: parseFlag("--desktop-config-path", ""),
  claudeCodeProjectRoot: parseFlag("--claude-code-project-root", "")
});

console.log(JSON.stringify(result, null, 2));

function parseFlag(name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] || fallback;
}
