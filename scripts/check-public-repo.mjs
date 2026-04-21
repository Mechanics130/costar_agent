import { readFile } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const sampleDirs = [
  "relationship-capture/samples",
  "relationship-ingestion/samples",
  "relationship-profile/samples",
  "relationship-briefing/samples",
  "relationship-roleplay/samples",
  "relationship-graph/samples",
  "relationship-view/samples",
];

const bannedPatterns = [
  "天气Agent",
  "外卖补贴",
  "信息黑洞",
  "lenny-bcontext",
  "tester_Bcontext",
  "D:\\\\tester_Bcontext",
  "D:\\\\Lenny_Bcontext",
];

const requiredFiles = [
  "LICENSE",
  "NOTICE",
  "package.json",
  "README.md",
  "README.zh-CN.md",
  "ROADMAP.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CHANGELOG.md",
  "bin/costar.mjs",
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

function listJsonFiles(dir) {
  const absDir = path.join(repoRoot, dir);
  if (!existsSync(absDir)) {
    fail(`Missing sample directory: ${dir}`);
    return [];
  }
  const entries = [];
  for (const name of readdirSync(absDir)) {
    const abs = path.join(absDir, name);
    if (statSync(abs).isFile() && name.endsWith(".json")) {
      entries.push(abs);
    }
  }
  return entries;
}

for (const file of requiredFiles) {
  checkFileExists(file);
}

const pkg = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
if (pkg.name !== "costar") fail("package.json name should be costar");
if (pkg.license !== "Apache-2.0") fail("package.json license should be Apache-2.0");

for (const file of [
  "bin/costar.mjs",
  "scripts/check-public-repo.mjs",
  "relationship-capture/runtime/run-relationship-capture.mjs",
  "relationship-ingestion/runtime/run-relationship-ingestion.mjs",
  "relationship-profile/runtime/run-relationship-profile.mjs",
  "relationship-briefing/runtime/run-relationship-briefing.mjs",
  "relationship-roleplay/runtime/run-relationship-roleplay.mjs",
  "relationship-graph/runtime/run-relationship-graph.mjs",
  "relationship-view/runtime/run-relationship-view.mjs",
]) {
  const result = spawnSync(process.execPath, ["--check", path.join(repoRoot, file)], {
    stdio: "pipe",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail(`Syntax check failed for ${file}\n${result.stderr || result.stdout}`);
  }
}

for (const dir of sampleDirs) {
  for (const file of listJsonFiles(dir)) {
    const content = await readFile(file, "utf8");
    try {
      JSON.parse(content);
    } catch (error) {
      fail(`Invalid JSON in ${path.relative(repoRoot, file)}: ${error.message}`);
    }
    for (const pattern of bannedPatterns) {
      if (content.includes(pattern)) {
        fail(`Public sample still contains banned pattern "${pattern}" in ${path.relative(repoRoot, file)}`);
      }
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("CoStar public repo checks passed.");
