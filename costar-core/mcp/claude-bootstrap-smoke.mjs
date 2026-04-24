// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(repoRoot, "bin", "costar.mjs");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "costar-claude-bootstrap-"));

try {
  const run = spawnSync(
    process.execPath,
    [
      cliPath,
      "host",
      "install",
      "claude",
      "--target-dir",
      tempRoot
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  record(run.status === 0, "Node host installer exits successfully", (run.stderr || run.stdout || "").trim());

  const adapterTarget = path.join(tempRoot, "CoStar-Claude");
  const expectedFiles = [
    "README.md",
    "QUICKSTART.md",
    "FIRST_SESSION.md",
    "FINAL_USER_ACCEPTANCE.md",
    "FINAL_USER_RESULTS_TEMPLATE.md",
    "PROMPT_PACKET.md",
    "SESSION_PROTOCOL.md",
    "TEST_REQUIREMENTS.md",
    "TEST_PACK.md",
    "TEST_RESULTS_TEMPLATE.md",
    "MOCK_TRANSCRIPT.md",
    "tool-exposure.json",
    "sample-workflow.md",
    "claude-desktop.mcp.json",
    "claude-code.mcp.json",
    "manifest.json",
    "install-claude-config.ps1",
    "install-claude-config.mjs",
    "doctor-claude-install.mjs",
    "run-costar-mcp.mjs"
  ];

  expectedFiles.forEach((name) => {
    const exists = readdirSync(adapterTarget).includes(name);
    record(exists, `bootstrap copies ${name}`, "");
  });

  const desktopConfig = readUtf8(path.join(adapterTarget, "claude-desktop.mcp.json"));
  const codeConfig = readUtf8(path.join(adapterTarget, "claude-code.mcp.json"));
  const manifest = readUtf8(path.join(adapterTarget, "manifest.json"));
  const installScript = readUtf8(path.join(adapterTarget, "install-claude-config.ps1"));
  const nodeInstallScript = readUtf8(path.join(adapterTarget, "install-claude-config.mjs"));

  record(!desktopConfig.includes("{{COSTAR_REPO_ROOT}}"), "desktop MCP config replaces repo placeholder", "");
  record(!codeConfig.includes("{{COSTAR_REPO_ROOT}}"), "code MCP config replaces repo placeholder", "");
  record(!manifest.includes("{{COSTAR_REPO_ROOT}}"), "manifest replaces repo placeholder", "");
  record(desktopConfig.includes("run-costar-mcp.mjs"), "desktop MCP config points at bundle MCP runner", "");
  record(codeConfig.includes("run-costar-mcp.mjs"), "code MCP config points at bundle MCP runner", "");
  record(manifest.includes("run-costar-mcp.mjs"), "manifest points at bundle MCP runner", "");
  record(!installScript.includes('[string]$RepoRoot = "__COSTAR_REPO_ROOT__"'), "install script binds RepoRoot during bootstrap", "");
  record(!nodeInstallScript.includes('__COSTAR_REPO_ROOT__'), "Node install script binds RepoRoot during bootstrap", "");
  const bundleMcpRunner = readUtf8(path.join(adapterTarget, "run-costar-mcp.mjs"));
  record(!bundleMcpRunner.includes('__COSTAR_REPO_ROOT__'), "bundle MCP runner binds RepoRoot during bootstrap", "");

  const samplesDir = path.join(adapterTarget, "samples");
  const sampleFiles = readdirSync(samplesDir);
  record(sampleFiles.length >= 7, "bootstrap copies host-model sample requests", JSON.stringify(sampleFiles));
} catch (error) {
  failures.push({
    name: "claude bootstrap smoke crashed",
    detail: String(error?.stack || error)
  });
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}
