// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const scannerFile = path.join(repoRoot, "scripts/check-public-repo.mjs");
const textExtensions = new Set([
  ".md",
  ".json",
  ".mjs",
  ".js",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
]);

const bannedPatterns = [
  "by Codex",
  "build-history",
  "CoStar_Agent-Lenny",
  "costar_agent-lenny1",
  "launch-plan",
  "launch-notes",
  "lenny-bcontext.local",
  "api.z.ai",
  "tester_Bcontext",
  "D:\\\\tester_Bcontext",
  "D:\\\\Lenny_Bcontext",
  "E:\\\\codex",
];

const requiredFiles = [
  "LICENSE",
  "NOTICE",
  "package.json",
  "package-lock.json",
  "eslint.config.mjs",
  "README.md",
  "README.zh-CN.md",
  "ROADMAP.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  "bin/costar.mjs",
];

const forbiddenFiles = [
  "docs/launch-plan.md",
  "docs/launch-notes.md",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function checkFileExists(relPath) {
  if (!existsSync(path.join(repoRoot, relPath))) {
    fail(`Missing required file: ${relPath}`);
  }
}

function checkFileMissing(relPath) {
  if (existsSync(path.join(repoRoot, relPath))) {
    fail(`Forbidden file still present: ${relPath}`);
  }
}

function collectTextFiles(dir = repoRoot, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTextFiles(abs, files);
      continue;
    }
    if (abs === scannerFile) {
      continue;
    }
    if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(abs);
    }
  }
  return files;
}

for (const file of requiredFiles) {
  checkFileExists(file);
}

for (const file of forbiddenFiles) {
  checkFileMissing(file);
}

const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
if (pkg.name !== "costar") fail("package.json name should be costar");
if (pkg.license !== "Apache-2.0") fail("package.json license should be Apache-2.0");
if (!pkg.engines || pkg.engines.node !== ">=18") {
  fail("package.json should declare node >=18");
}

for (const file of [
  "bin/costar.mjs",
  "scripts/check-public-repo.mjs",
  "relationship-capture/runtime/run-relationship-capture.mjs",
  "relationship-capture/runtime/relationship-capture.mjs",
  "relationship-capture/runtime/render-relationship-capture-summary.mjs",
  "relationship-ingestion/runtime/run-relationship-ingestion.mjs",
  "relationship-ingestion/runtime/run-relationship-review-resolution.mjs",
  "relationship-ingestion/runtime/relationship-ingestion.mjs",
  "relationship-ingestion/runtime/relationship-review-resolution.mjs",
  "relationship-profile/runtime/run-relationship-profile.mjs",
  "relationship-profile/runtime/relationship-profile.mjs",
  "relationship-briefing/runtime/run-relationship-briefing.mjs",
  "relationship-briefing/runtime/relationship-briefing.mjs",
  "relationship-roleplay/runtime/run-relationship-roleplay.mjs",
  "relationship-roleplay/runtime/relationship-roleplay.mjs",
  "relationship-graph/runtime/run-relationship-graph.mjs",
  "relationship-graph/runtime/run-relationship-graph-review-resolution.mjs",
  "relationship-graph/runtime/relationship-graph.mjs",
  "relationship-graph/runtime/relationship-graph-review-resolution.mjs",
  "relationship-view/runtime/run-relationship-view.mjs",
  "relationship-view/runtime/relationship-view.mjs",
]) {
  const result = spawnSync(process.execPath, ["--check", path.join(repoRoot, file)], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`Syntax check failed for ${file}\n${result.stderr || result.stdout}`);
  }
}

for (const file of collectTextFiles()) {
  const content = await readFile(file, "utf8");
  for (const pattern of bannedPatterns) {
    if (content.includes(pattern)) {
      fail(`Public file still contains banned pattern "${pattern}" in ${path.relative(repoRoot, file)}`);
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("CoStar public repo checks passed.");
