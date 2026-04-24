// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, existsSync, rmSync } from "node:fs";
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

const installRoot = mkdtempSync(path.join(os.tmpdir(), "costar-host-cli-"));
const desktopConfigPath = path.join(installRoot, "Claude", "claude_desktop_config.json");
const codeProjectRoot = path.join(installRoot, "project");

try {
  const help = runCli(["--help"]);
  record(help.status === 0, "CLI help exits successfully", help.stderr || help.stdout);
  record(help.stdout.includes("costar host install claude"), "CLI help mentions host install command", "");

  const hostHelp = runCli(["host", "--help"]);
  record(hostHelp.status === 0, "host help exits successfully", hostHelp.stderr || hostHelp.stdout);
  record(hostHelp.stdout.includes("costar host doctor claude"), "host help mentions doctor command", "");

  const whereClaude = runCli(["host", "where", "claude", "--target-dir", installRoot]);
  record(whereClaude.status === 0, "host where claude exits successfully", whereClaude.stderr || whereClaude.stdout);
  const whereClaudeJson = JSON.parse(whereClaude.stdout);
  record(whereClaudeJson.host === "claude", "host where claude reports host", "");
  record(/costar-mcp-server\.mjs$/i.test(whereClaudeJson.mcp_server || ""), "host where claude reports MCP server", "");

  const whereCodex = runCli(["host", "where", "codex", "--target-dir", installRoot]);
  record(whereCodex.status === 0, "host where codex exits successfully", whereCodex.stderr || whereCodex.stdout);
  const whereCodexJson = JSON.parse(whereCodex.stdout);
  record(whereCodexJson.host === "codex", "host where codex reports host", "");
  record(whereCodexJson.mcp_server === null, "host where codex reports no MCP server", "");
  record(Boolean(whereCodexJson.default_codex_skills_dir), "host where codex reports default skills dir", String(whereCodexJson.default_codex_skills_dir || ""));

  const whereOpenClaw = runCli(["host", "where", "openclaw", "--target-dir", installRoot]);
  record(whereOpenClaw.status === 0, "host where openclaw exits successfully", whereOpenClaw.stderr || whereOpenClaw.stdout);
  const whereOpenClawJson = JSON.parse(whereOpenClaw.stdout);
  record(whereOpenClawJson.host === "openclaw", "host where openclaw reports host", "");
  record(whereOpenClawJson.suggested_install_dir.endsWith("CoStar-OpenClaw"), "host where openclaw reports install folder", "");

  const installClaude = runCli(["host", "install", "claude", "--target-dir", installRoot], 60000);
  record(installClaude.status === 0, "host install claude exits successfully", installClaude.stderr || installClaude.stdout);
  const claudeBundleDir = path.join(installRoot, "CoStar-Claude");
  record(existsSync(path.join(claudeBundleDir, "claude-desktop.mcp.json")), "host install claude creates adapter files", "");

  const installClaudeWithConfig = runCli([
    "host",
    "install",
    "claude",
    "--target-dir",
    installRoot,
    "--apply-config",
    "--desktop-config-path",
    desktopConfigPath,
    "--claude-code-project-root",
    codeProjectRoot
  ], 60000);
  record(installClaudeWithConfig.status === 0, "host install claude --apply-config exits successfully", installClaudeWithConfig.stderr || installClaudeWithConfig.stdout);

  const claudeBundleDoctor = spawnSync(process.execPath, [
    path.join(claudeBundleDir, "doctor-claude-install.mjs"),
    "--require-config",
    "--desktop-config-path",
    desktopConfigPath,
    "--claude-code-project-root",
    codeProjectRoot
  ], {
    cwd: claudeBundleDir,
    encoding: "utf8",
    timeout: 30000
  });
  record(claudeBundleDoctor.status === 0, "host install claude --apply-config passes bundle-local doctor", claudeBundleDoctor.stderr || claudeBundleDoctor.stdout);

  const installCodex = runCli(["host", "install", "codex", "--target-dir", installRoot], 60000);
  record(installCodex.status === 0, "host install codex exits successfully", installCodex.stderr || installCodex.stdout);
  record(existsSync(path.join(installRoot, "CoStar-Codex", "PROMPT_PACKET.md")), "host install codex creates adapter files", "");
  record(existsSync(path.join(installRoot, "CoStar-Codex", "SKILL.md")), "host install codex creates skill file", "");

  const codexSkillsDir = path.join(installRoot, "codex-skills");
  const installCodexSkill = runCli(["host", "install", "codex", "--codex-skills-dir", codexSkillsDir], 60000);
  record(installCodexSkill.status === 0, "host install codex --codex-skills-dir exits successfully", installCodexSkill.stderr || installCodexSkill.stdout);
  record(existsSync(path.join(codexSkillsDir, "costar", "SKILL.md")), "host install codex writes discoverable skill", "");

  const codexHome = path.join(installRoot, "codex-home");
  const installCodexApplySkill = runCli(["host", "install", "codex", "--apply-skill"], 60000, { CODEX_HOME: codexHome });
  record(installCodexApplySkill.status === 0, "host install codex --apply-skill exits successfully", installCodexApplySkill.stderr || installCodexApplySkill.stdout);
  record(existsSync(path.join(codexHome, "skills", "costar", "SKILL.md")), "host install codex --apply-skill uses CODEX_HOME skills", "");

  const installOpenClaw = runCli(["host", "install", "openclaw", "--target-dir", installRoot], 60000);
  record(installOpenClaw.status === 0, "host install openclaw exits successfully", installOpenClaw.stderr || installOpenClaw.stdout);
  record(existsSync(path.join(installRoot, "CoStar-OpenClaw", "SKILL.md")), "host install openclaw creates skill file", "");
  record(existsSync(path.join(installRoot, "CoStar-OpenClaw", "PROMPT_PACKET.md")), "host install openclaw creates prompt packet", "");
} catch (error) {
  failures.push({
    name: "host CLI smoke crashed",
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

function runCli(args, timeout = 30000, env = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
    env: { ...process.env, ...env }
  });
}
