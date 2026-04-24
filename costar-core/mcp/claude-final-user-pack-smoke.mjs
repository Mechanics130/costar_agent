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

const acceptanceDoc = readUtf8(path.join(repoRoot, "integrations", "claude", "FINAL_USER_ACCEPTANCE.md"));
const resultsTemplate = readUtf8(path.join(repoRoot, "integrations", "claude", "FINAL_USER_RESULTS_TEMPLATE.md"));
const quickstart = readUtf8(path.join(repoRoot, "integrations", "claude", "QUICKSTART.md"));

record(acceptanceDoc.includes("The user does not need to configure a model API."), "final-user acceptance doc includes hard acceptance 1", "");
record(acceptanceDoc.includes("The user can complete the full loop inside Claude."), "final-user acceptance doc includes hard acceptance 2", "");
record(acceptanceDoc.includes("Generated results enter the same CoStar store / schema / review system."), "final-user acceptance doc includes hard acceptance 3", "");
record(acceptanceDoc.includes("CoStar has not split into two data worlds."), "final-user acceptance doc includes hard acceptance 4", "");
record(acceptanceDoc.includes("FIRST_SESSION.md"), "final-user acceptance doc points to first-session prompt", "");
record(acceptanceDoc.includes("FINAL_USER_RESULTS_TEMPLATE.md"), "final-user acceptance doc points to results template", "");
record(resultsTemplate.includes("Hard acceptance outcomes"), "final-user results template includes acceptance section", "");
record(resultsTemplate.includes("Real session observations"), "final-user results template includes real-session observations", "");
record(quickstart.includes("FINAL_USER_ACCEPTANCE.md"), "quickstart points to final-user acceptance pack", "");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}
