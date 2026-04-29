// SPDX-License-Identifier: Apache-2.0

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyClaudeConfig,
  defaultClaudeDesktopConfigPath,
  defaultCodexSkillsDir,
  installHostBundle
} from "./host-installer.mjs";

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

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "costar-host-installer-"));

try {
  const macClaudePath = defaultClaudeDesktopConfigPath({
    platform: "darwin",
    homedir: "/Users/riley",
    env: {}
  });
  record(
    macClaudePath === "/Users/riley/Library/Application Support/Claude/claude_desktop_config.json",
    "macOS Claude Desktop config path is supported",
    macClaudePath
  );

  const winClaudePath = defaultClaudeDesktopConfigPath({
    platform: "win32",
    homedir: "C:\\Users\\Riley",
    env: { APPDATA: "C:\\Users\\Riley\\AppData\\Roaming" }
  });
  record(
    winClaudePath === "C:\\Users\\Riley\\AppData\\Roaming\\Claude\\claude_desktop_config.json",
    "Windows Claude Desktop config path remains supported",
    winClaudePath
  );

  const macCodexSkillsDir = defaultCodexSkillsDir({
    platform: "darwin",
    homedir: "/Users/riley",
    env: {}
  });
  record(
    macCodexSkillsDir === "/Users/riley/.codex/skills",
    "macOS Codex skills path is supported",
    macCodexSkillsDir
  );

  const winCodexSkillsDir = defaultCodexSkillsDir({
    platform: "win32",
    homedir: "C:\\Users\\Riley",
    env: {}
  });
  record(
    winCodexSkillsDir === "C:\\Users\\Riley\\.codex\\skills",
    "Windows Codex skills path remains supported",
    winCodexSkillsDir
  );

  const installRoot = path.join(tempRoot, "hosts");
  const claudeInstall = installHostBundle({
    host: "claude",
    repoRoot,
    targetDir: installRoot
  });
  record(existsSync(path.join(claudeInstall.bundle_dir, "install-claude-config.mjs")), "Claude bundle includes Node config installer", "");
  record(existsSync(path.join(claudeInstall.bundle_dir, "install-claude-config.ps1")), "Claude bundle keeps legacy PowerShell config installer", "");
  record(!readUtf8(path.join(claudeInstall.bundle_dir, "run-costar-mcp.mjs")).includes("__COSTAR_REPO_ROOT__"), "Claude MCP runner embeds repo root", "");
  record(!readUtf8(path.join(claudeInstall.bundle_dir, "install-claude-config.mjs")).includes("__COSTAR_REPO_ROOT__"), "Claude Node config installer embeds repo root", "");

  for (const jsonName of ["claude-desktop.mcp.json", "claude-code.mcp.json", "manifest.json", "tool-exposure.json"]) {
    JSON.parse(readUtf8(path.join(claudeInstall.bundle_dir, jsonName)));
    record(true, `${jsonName} parses after Node install`, "");
  }

  const desktopConfigPath = path.join(tempRoot, "mac-home", "Library", "Application Support", "Claude", "claude_desktop_config.json");
  const codeProjectRoot = path.join(tempRoot, "project");
  const configResult = applyClaudeConfig({
    repoRoot,
    bundleDir: claudeInstall.bundle_dir,
    mode: "both",
    desktopConfigPath,
    claudeCodeProjectRoot: codeProjectRoot
  });
  record(configResult.updated.includes("desktop"), "cross-platform config writes desktop config", JSON.stringify(configResult.updated));
  record(configResult.updated.includes("code"), "cross-platform config writes Claude Code config", JSON.stringify(configResult.updated));

  const desktopConfig = JSON.parse(readUtf8(desktopConfigPath));
  record(
    desktopConfig.mcpServers?.costar?.args?.[0] === path.join(claudeInstall.bundle_dir, "run-costar-mcp.mjs"),
    "desktop config points at installed bundle runner",
    JSON.stringify(desktopConfig.mcpServers?.costar || null)
  );

  const codexInstall = installHostBundle({
    host: "codex",
    repoRoot,
    targetDir: installRoot
  });
  record(existsSync(path.join(codexInstall.bundle_dir, "PROMPT_PACKET.md")), "Codex bundle installs without PowerShell", "");
  record(existsSync(path.join(codexInstall.bundle_dir, "SKILL.md")), "Codex bundle includes skill entrypoint", "");

  const codexSkillsDir = path.join(tempRoot, "codex-home", "skills");
  const codexSkillInstall = installHostBundle({
    host: "codex",
    repoRoot,
    codexSkillsDir
  });
  record(codexSkillInstall.bundle_dir === path.join(codexSkillsDir, "costar"), "Codex skill installs into costar skill folder", codexSkillInstall.bundle_dir);
  record(existsSync(path.join(codexSkillInstall.bundle_dir, "SKILL.md")), "Codex skill install writes SKILL.md", "");
  record(!readUtf8(path.join(codexSkillInstall.bundle_dir, "SKILL.md")).includes("{{COSTAR_REPO_ROOT}}"), "Codex skill embeds repo root", "");

  const openClawInstall = installHostBundle({
    host: "openclaw",
    repoRoot,
    targetDir: installRoot,
    skipSmoke: true
  });
  record(existsSync(path.join(openClawInstall.bundle_dir, "SKILL.md")), "OpenClaw bundle installs without PowerShell", "");
} catch (error) {
  failures.push({
    name: "host installer smoke crashed",
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
