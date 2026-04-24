// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync } from "node:fs";
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

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "costar-claude-bundle-doctor-"));
const installRoot = path.join(tempRoot, "hosts");
const desktopConfigPath = path.join(tempRoot, "Claude", "claude_desktop_config.json");
const codeProjectRoot = path.join(tempRoot, "project");

try {
  const install = spawnSync(process.execPath, [cliPath, "host", "install", "claude", "--target-dir", installRoot], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 60000
  });
  record(install.status === 0, "CLI installs Claude bundle for doctor smoke", install.stderr || install.stdout);

  const bundleDir = path.join(installRoot, "CoStar-Claude");
  const configScript = spawnSync(process.execPath, [
    path.join(bundleDir, "install-claude-config.mjs"),
    "--mode",
    "both",
    "--desktop-config-path",
    desktopConfigPath,
    "--claude-code-project-root",
    codeProjectRoot
  ], {
    cwd: bundleDir,
    encoding: "utf8"
  });
  record(configScript.status === 0, "bundle config script runs before bundle doctor", configScript.stderr || configScript.stdout);

  const doctor = spawnSync(process.execPath, [
    path.join(bundleDir, "doctor-claude-install.mjs"),
    "--require-config",
    "--desktop-config-path",
    desktopConfigPath,
    "--claude-code-project-root",
    codeProjectRoot
  ], {
    cwd: bundleDir,
    encoding: "utf8"
  });
  record(doctor.status === 0, "bundle-local doctor exits successfully", doctor.stderr || doctor.stdout);
  const doctorJson = JSON.parse(doctor.stdout);
  record(doctorJson.status === "passed", "bundle-local doctor reports passed status", JSON.stringify(doctorJson));
  record(doctorJson.checks.some((item) => item.name === "bundle MCP runner initializes" && item.ok), "bundle-local doctor verifies MCP initialization", JSON.stringify(doctorJson.checks));
} catch (error) {
  failures.push({
    name: "claude bundle doctor smoke crashed",
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
