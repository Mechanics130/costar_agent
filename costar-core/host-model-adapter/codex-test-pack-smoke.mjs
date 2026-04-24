// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const testPack = readUtf8(path.join(repoRoot, "integrations", "codex", "TEST_PACK.md"));
const resultsTemplate = readUtf8(path.join(repoRoot, "integrations", "codex", "TEST_RESULTS_TEMPLATE.md"));
const skillPath = path.join(repoRoot, "integrations", "codex", "costar", "SKILL.md");
const skill = readUtf8(skillPath);

record(existsSync(skillPath), "codex skill entrypoint exists", "");
record(skill.includes("name: costar"), "codex skill exposes front matter name", "");
record(skill.includes("without configuring a separate CoStar model API"), "codex skill guards zero API setup", "");
record(skill.includes("review_commit_decisions"), "codex skill mentions commit tool", "");
record(testPack.includes("Does the user no longer need to configure a model API?"), "codex test pack includes hard acceptance question 1", "");
record(testPack.includes("Can the user complete the full loop inside the host?"), "codex test pack includes hard acceptance question 2", "");
record(testPack.includes("Do generated results enter the same CoStar store / schema / review system?"), "codex test pack includes hard acceptance question 3", "");
record(testPack.includes("Has CoStar avoided splitting into two data worlds?"), "codex test pack includes hard acceptance question 4", "");
record(testPack.includes("review-prepare.profile.request.example.json"), "codex test pack points to review prepare sample", "");
record(testPack.includes("host-model-e2e-smoke.mjs"), "codex test pack points to e2e smoke", "");
record(resultsTemplate.includes("Hard acceptance questions"), "codex results template includes acceptance section", "");
record(resultsTemplate.includes("Capture:"), "codex results template includes tool-path observation section", "");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}
