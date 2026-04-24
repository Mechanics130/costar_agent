// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
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

const readme = readUtf8(path.join(repoRoot, "integrations", "openclaw", "README.md"));
const skill = readUtf8(path.join(repoRoot, "integrations", "openclaw", "CoStar", "SKILL.md"));
const testPack = readUtf8(path.join(repoRoot, "integrations", "openclaw", "TEST_PACK.md"));
const resultsTemplate = readUtf8(path.join(repoRoot, "integrations", "openclaw", "TEST_RESULTS_TEMPLATE.md"));
const localGuide = readUtf8(path.join(repoRoot, "integrations", "openclaw", "LOCAL_CLAW_TEST_GUIDE.md"));
const toolExposure = JSON.parse(readUtf8(path.join(repoRoot, "integrations", "openclaw", "tool-exposure.json")));

record(readme.includes("should not need to configure a separate CoStar model API"), "OpenClaw README states no separate model API", "");
record(skill.includes("name: costar"), "OpenClaw SKILL exposes front matter name", "");
record(skill.includes("metadata:") && skill.includes("openclaw:"), "OpenClaw SKILL uses OpenClaw metadata block", "");
record(skill.includes("Do not ask the user to configure a separate CoStar model API"), "OpenClaw SKILL guards zero API setup", "");
record(skill.includes("review_commit_decisions"), "OpenClaw SKILL mentions commit tool", "");
record(testPack.includes("Does the user no longer need to configure a model API?"), "OpenClaw test pack includes hard acceptance question 1", "");
record(testPack.includes("Can the user complete the full loop inside the host?"), "OpenClaw test pack includes hard acceptance question 2", "");
record(testPack.includes("Do generated results enter the same CoStar store / schema / review system?"), "OpenClaw test pack includes hard acceptance question 3", "");
record(testPack.includes("Has CoStar avoided splitting into two data worlds?"), "OpenClaw test pack includes hard acceptance question 4", "");
record(testPack.includes("host-model-e2e-smoke.mjs"), "OpenClaw test pack points to E2E smoke", "");
record(testPack.includes("LOCAL_CLAW_TEST_GUIDE.md"), "OpenClaw test pack points to local claw guide", "");
record(resultsTemplate.includes("Hard acceptance questions"), "OpenClaw result template includes acceptance section", "");
record(localGuide.includes("openclaw skills info costar"), "OpenClaw local guide verifies skill discovery", "");
record(localGuide.includes("openclaw agent --agent main"), "OpenClaw local guide includes host turn command", "");
record(localGuide.includes("No separate CoStar model API is requested"), "OpenClaw local guide includes zero API pass condition", "");
record(toolExposure.host === "openclaw", "OpenClaw tool exposure reports host", "");
record(Array.isArray(toolExposure.tools) && toolExposure.tools.includes("review_prepare_cards"), "OpenClaw tool exposure includes review cards", "");
record(Array.isArray(toolExposure.write_targets) && toolExposure.write_targets.includes("profile_review"), "OpenClaw tool exposure includes profile write target", "");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}
