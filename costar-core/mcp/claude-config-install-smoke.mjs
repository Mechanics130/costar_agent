// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const installScript = path.join(repoRoot, "integrations", "claude", "install-claude-config.mjs");
const bundleRoot = path.join(repoRoot, "integrations", "claude");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "costar-claude-config-"));
const desktopConfigPath = path.join(tempRoot, "Claude", "claude_desktop_config.json");
const codeProjectRoot = path.join(tempRoot, "project");

try {
  const seedConfig = {
    mcpServers: {
      existing: {
        command: "node",
        args: ["existing-server.mjs"],
        env: {
          EXISTING_NESTED_VALUE: "preserved"
        }
      }
    },
    otherSettings: {
      nested: {
        enabled: true
      }
    }
  };
  mkdirSync(path.dirname(desktopConfigPath), { recursive: true });
  mkdirSync(codeProjectRoot, { recursive: true });
  writeFileSync(desktopConfigPath, `${JSON.stringify(seedConfig, null, 2)}\n`, "utf8");
  writeFileSync(path.join(codeProjectRoot, ".mcp.json"), `${JSON.stringify(seedConfig, null, 2)}\n`, "utf8");

  const run = spawnSync(
    process.execPath,
    [
      installScript,
      "--repo-root",
      repoRoot,
      "--bundle-root",
      bundleRoot,
      "--mode",
      "both",
      "--desktop-config-path",
      desktopConfigPath,
      "--claude-code-project-root",
      codeProjectRoot
    ],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );

  record(run.status === 0, "install-claude-config exits successfully", (run.stderr || run.stdout || "").trim());
  const result = JSON.parse(run.stdout);
  record(Array.isArray(result.updated) && result.updated.includes("desktop"), "desktop config marked updated", JSON.stringify(result.updated));
  record(Array.isArray(result.updated) && result.updated.includes("code"), "code config marked updated", JSON.stringify(result.updated));

  const desktopConfig = JSON.parse(readUtf8(desktopConfigPath));
  const codeConfig = JSON.parse(readUtf8(path.join(codeProjectRoot, ".mcp.json")));

  record(desktopConfig.mcpServers?.costar?.command === "node", "desktop config sets node command", "");
  record(desktopConfig.mcpServers?.existing?.env?.EXISTING_NESTED_VALUE === "preserved", "desktop config preserves existing nested server config", JSON.stringify(desktopConfig.mcpServers?.existing || null));
  record(/run-costar-mcp\.mjs$/i.test(desktopConfig.mcpServers?.costar?.args?.[0] || ""), "desktop config points at installed bundle MCP runner", JSON.stringify(desktopConfig.mcpServers?.costar?.args || null));
  record(desktopConfig.otherSettings?.nested?.enabled === true, "desktop config preserves existing nested settings", JSON.stringify(desktopConfig.otherSettings || null));
  record(codeConfig.mcpServers?.costar?.command === "node", "code config sets node command", "");
  record(codeConfig.mcpServers?.existing?.env?.EXISTING_NESTED_VALUE === "preserved", "code config preserves existing nested server config", JSON.stringify(codeConfig.mcpServers?.existing || null));
  record(/run-costar-mcp\.mjs$/i.test(codeConfig.mcpServers?.costar?.args?.[0] || ""), "code config points at installed bundle MCP runner", JSON.stringify(codeConfig.mcpServers?.costar?.args || null));
  record(codeConfig.otherSettings?.nested?.enabled === true, "code config preserves existing nested settings", JSON.stringify(codeConfig.otherSettings || null));
} catch (error) {
  failures.push({
    name: "claude config install smoke crashed",
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
