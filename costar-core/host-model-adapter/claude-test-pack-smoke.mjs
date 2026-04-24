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

const testPack = readUtf8(path.join(repoRoot, "integrations", "claude", "TEST_PACK.md"));
const resultsTemplate = readUtf8(path.join(repoRoot, "integrations", "claude", "TEST_RESULTS_TEMPLATE.md"));
const requirements = readUtf8(path.join(repoRoot, "integrations", "claude", "TEST_REQUIREMENTS.md"));

record(testPack.includes("Does the user no longer need to configure a model API?"), "test pack includes hard acceptance question 1", "");
record(testPack.includes("Can the user complete the full loop inside the host?"), "test pack includes hard acceptance question 2", "");
record(testPack.includes("Do generated results enter the same CoStar store / schema / review system?"), "test pack includes hard acceptance question 3", "");
record(testPack.includes("Has CoStar avoided splitting into two data worlds?"), "test pack includes hard acceptance question 4", "");
record(testPack.includes("costar-core/mcp/mcp-smoke.mjs"), "test pack points to MCP smoke", "");
record(testPack.includes("costar-core/mcp/claude-bootstrap-smoke.mjs"), "test pack points to Claude bootstrap smoke", "");
record(testPack.includes("costar-core/mcp/claude-config-install-smoke.mjs"), "test pack points to Claude config install smoke", "");
record(testPack.includes("costar-core/mcp/claude-clean-install-smoke.mjs"), "test pack points to Claude clean install smoke", "");
record(testPack.includes("doctor-claude-install.mjs --require-config"), "test pack points to installed bundle doctor", "");
record(testPack.includes("review-prepare.profile.request.example.json"), "test pack points to review prepare sample", "");
record(testPack.includes("host-model-e2e-smoke.mjs"), "test pack points to e2e smoke", "");
record(testPack.includes("FIRST_SESSION.md"), "test pack points to first-session guidance", "");
record(resultsTemplate.includes("Hard acceptance questions"), "results template includes acceptance section", "");
record(resultsTemplate.includes("Claude-native MCP entrypoint"), "results template includes MCP observation section", "");
record(resultsTemplate.includes("Capture:"), "results template includes tool-path observation section", "");
record(requirements.includes("In-scope files"), "requirements doc includes scope section", "");
record(requirements.includes("Out-of-scope files"), "requirements doc includes out-of-scope section", "");
record(requirements.includes("Allowed commands"), "requirements doc includes command section", "");
record(requirements.includes("Evidence standard"), "requirements doc includes evidence section", "");
record(requirements.includes("costar-core/mcp/costar-mcp-server.mjs"), "requirements doc includes MCP server in scope", "");
record(requirements.includes("integrations/claude/install-claude-config.ps1"), "requirements doc includes Claude config install script in scope", "");
record(requirements.includes("integrations/claude/doctor-claude-install.mjs"), "requirements doc includes bundle-local doctor in scope", "");
record(requirements.includes("costar-core/mcp/claude-clean-install-smoke.mjs"), "requirements doc includes clean-install smoke in scope", "");

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}
