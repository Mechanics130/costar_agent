// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const cliPath = path.join(repoRoot, "bin", "costar.mjs");
const installerPath = path.join(repoRoot, "costar-core", "host-install", "host-installer.mjs");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const installRoot = mkdtempSync(path.join(os.tmpdir(), "costar-openclaw-bootstrap-"));

try {
  const installerContent = readFileSync(installerPath, "utf8");
  record(!installerContent.includes("Read-Host"), "OpenClaw installer does not prompt interactively", "");
  record(!installerContent.includes("model-config.local.json"), "OpenClaw installer does not write model config", "");
  record(!installerContent.includes("ApiKey"), "OpenClaw installer does not ask for API key", "");

  const result = spawnSync(process.execPath, [
    cliPath,
    "host",
    "install",
    "openclaw",
    "--target-dir",
    installRoot,
    "--skip-smoke"
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60000
  });

  record(result.status === 0, "OpenClaw bootstrap exits successfully", result.stderr || result.stdout);
  const bundleRoot = path.join(installRoot, "CoStar-OpenClaw");
  record(existsSync(path.join(bundleRoot, "SKILL.md")), "OpenClaw bootstrap installs SKILL.md", "");
  record(existsSync(path.join(bundleRoot, "PROMPT_PACKET.md")), "OpenClaw bootstrap installs prompt packet", "");
  record(existsSync(path.join(bundleRoot, "SESSION_PROTOCOL.md")), "OpenClaw bootstrap installs session protocol", "");
  record(existsSync(path.join(bundleRoot, "TEST_PACK.md")), "OpenClaw bootstrap installs test pack", "");
  record(existsSync(path.join(bundleRoot, "samples", "capture-ingest.request.example.json")), "OpenClaw bootstrap installs samples", "");

  const promptPacket = readFileSync(path.join(bundleRoot, "PROMPT_PACKET.md"), "utf8");
  record(promptPacket.includes("CoStar Host-model Prompt Packet for OpenClaw"), "OpenClaw prompt packet is generated for OpenClaw", "");
  record(promptPacket.includes("review_commit_decisions"), "OpenClaw prompt packet includes commit tool", "");
} catch (error) {
  failures.push({
    name: "OpenClaw bootstrap smoke crashed",
    detail: String(error?.stack || error)
  });
} finally {
  rmSync(installRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
