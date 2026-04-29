// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";

const claudeFiles = [
  "README.md",
  "QUICKSTART.md",
  "FIRST_SESSION.md",
  "FINAL_USER_ACCEPTANCE.md",
  "FINAL_USER_RESULTS_TEMPLATE.md",
  "tool-exposure.json",
  "sample-workflow.md",
  "TEST_REQUIREMENTS.md",
  "TEST_PACK.md",
  "TEST_RESULTS_TEMPLATE.md",
  "MOCK_TRANSCRIPT.md",
  "claude-desktop.mcp.json",
  "claude-code.mcp.json",
  "manifest.json",
  "install-claude-config.ps1",
  "install-claude-config.mjs",
  "doctor-claude-install.mjs",
  "run-costar-mcp.mjs"
];

const codexFiles = [
  "README.md",
  "tool-exposure.json",
  "sample-workflow.md",
  "TEST_PACK.md",
  "TEST_RESULTS_TEMPLATE.md",
  "MOCK_TRANSCRIPT.md"
];

const openClawFiles = [
  "README.md",
  "PROMPT_PACKET.md",
  "SESSION_PROTOCOL.md",
  "LOCAL_CLAW_TEST_GUIDE.md",
  "TEST_PACK.md",
  "TEST_RESULTS_TEMPLATE.md",
  "MOCK_TRANSCRIPT.md",
  "tool-exposure.json",
  "sample-workflow.md"
];

export function defaultHostTargetDir(options = {}) {
  const home = options.homedir || os.homedir();
  return path.join(home, ".costar-hosts");
}

export function defaultCodexSkillsDir(options = {}) {
  const platform = options.platform || process.platform;
  const home = options.homedir || os.homedir();
  const env = options.env || process.env;
  const codexHome = env.CODEX_HOME || (platform === "win32"
    ? path.win32.join(home, ".codex")
    : path.posix.join(home.replace(/\\/g, "/"), ".codex"));

  if (platform === "win32") {
    return path.win32.join(codexHome, "skills");
  }
  return path.posix.join(String(codexHome).replace(/\\/g, "/"), "skills");
}

export function hostInstallFolder(host, options = {}) {
  if (host === "claude") {
    return "CoStar-Claude";
  }
  if (host === "codex") {
    if (options.codexSkillsDir) {
      return "costar";
    }
    return "CoStar-Codex";
  }
  if (host === "openclaw") {
    return options.openClawSkillsDir ? "CoStar" : "CoStar-OpenClaw";
  }
  return `CoStar-${host}`;
}

export function defaultClaudeDesktopConfigPath(options = {}) {
  const platform = options.platform || process.platform;
  const home = options.homedir || os.homedir();
  const env = options.env || process.env;

  if (platform === "win32") {
    const appData = env.APPDATA || path.win32.join(home, "AppData", "Roaming");
    return path.win32.join(appData, "Claude", "claude_desktop_config.json");
  }
  if (platform === "darwin") {
    return path.posix.join(home.replace(/\\/g, "/"), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  const configHome = env.XDG_CONFIG_HOME || path.posix.join(home.replace(/\\/g, "/"), ".config");
  return path.posix.join(configHome, "Claude", "claude_desktop_config.json");
}

export function installHostBundle(options) {
  const host = String(options?.host || "").toLowerCase();
  const repoRoot = path.resolve(requiredString(options?.repoRoot, "repoRoot"));
  const targetDir = options?.targetDir ? resolveUserPath(options.targetDir) : "";
  const codexSkillsDir = options?.codexSkillsDir ? resolveUserPath(options.codexSkillsDir) : "";
  const openClawSkillsDir = options?.openClawSkillsDir ? resolveUserPath(options.openClawSkillsDir) : "";

  if (!existsSync(repoRoot)) {
    throw new Error(`RepoRoot does not exist: ${repoRoot}`);
  }

  if (host === "claude") {
    return installClaudeBundle({ repoRoot, targetDir });
  }
  if (host === "codex") {
    return installCodexBundle({ repoRoot, targetDir, codexSkillsDir });
  }
  if (host === "openclaw") {
    return installOpenClawBundle({
      repoRoot,
      targetDir,
      openClawSkillsDir,
      skipSmoke: Boolean(options?.skipSmoke)
    });
  }
  throw new Error(`Unknown host target: ${host || "<empty>"}`);
}

export function applyClaudeConfig(options) {
  const repoRoot = path.resolve(requiredString(options?.repoRoot, "repoRoot"));
  const bundleDir = path.resolve(requiredString(options?.bundleDir, "bundleDir"));
  const mode = options?.mode || "both";
  const desktopConfigPath = resolveUserPath(options?.desktopConfigPath || defaultClaudeDesktopConfigPath());
  const claudeCodeProjectRoot = resolveUserPath(options?.claudeCodeProjectRoot || repoRoot);
  const codeConfigPath = path.join(claudeCodeProjectRoot, ".mcp.json");
  const bundleMcpRunner = path.join(bundleDir, "run-costar-mcp.mjs");

  if (!["desktop", "code", "both"].includes(mode)) {
    throw new Error(`Invalid Claude config mode: ${mode}`);
  }
  if (!existsSync(bundleMcpRunner)) {
    throw new Error(`Missing bundle MCP runner: ${bundleMcpRunner}`);
  }

  const result = {
    repo_root: repoRoot,
    bundle_root: bundleDir,
    desktop_config_path: desktopConfigPath,
    code_config_path: codeConfigPath,
    updated: []
  };

  if (mode === "desktop" || mode === "both") {
    const desktopConfig = readJsonObjectOrDefault(desktopConfigPath);
    setCostarMcpServer(desktopConfig, bundleMcpRunner);
    backupFileIfExists(desktopConfigPath);
    writeJsonFile(desktopConfigPath, desktopConfig);
    result.updated.push("desktop");
  }

  if (mode === "code" || mode === "both") {
    const codeConfig = readJsonObjectOrDefault(codeConfigPath);
    setCostarMcpServer(codeConfig, bundleMcpRunner);
    backupFileIfExists(codeConfigPath);
    writeJsonFile(codeConfigPath, codeConfig);
    result.updated.push("code");
  }

  return result;
}

function installClaudeBundle({ repoRoot, targetDir }) {
  const adapterSource = path.join(repoRoot, "integrations", "claude");
  const adapterTarget = targetDir ? path.join(targetDir, "CoStar-Claude") : adapterSource;
  ensureSource(adapterSource, "Claude adapter source");

  if (!targetDir) {
    return { host: "claude", bundle_dir: adapterSource, installed: false };
  }

  ensureDir(adapterTarget);
  const replacements = buildReplacements(repoRoot, adapterTarget);
  for (const name of claudeFiles) {
    copyTemplateFile({
      sourcePath: path.join(adapterSource, name),
      targetPath: path.join(adapterTarget, name),
      replacements
    });
  }

  copySamples(repoRoot, adapterTarget);
  renderHostPacket(repoRoot, "claude", path.join(adapterTarget, "PROMPT_PACKET.md"));
  renderSessionProtocol(repoRoot, "claude", path.join(adapterTarget, "SESSION_PROTOCOL.md"));

  return { host: "claude", bundle_dir: adapterTarget, installed: true };
}

function installCodexBundle({ repoRoot, targetDir, codexSkillsDir }) {
  const adapterSource = path.join(repoRoot, "integrations", "codex");
  const adapterTarget = codexSkillsDir
    ? path.join(codexSkillsDir, "costar")
    : targetDir
      ? path.join(targetDir, "CoStar-Codex")
      : adapterSource;
  ensureSource(adapterSource, "Codex adapter source");

  if (!targetDir && !codexSkillsDir) {
    return { host: "codex", bundle_dir: adapterSource, installed: false };
  }

  ensureDir(adapterTarget);
  const replacements = buildReplacements(repoRoot, adapterTarget);
  for (const name of codexFiles) {
    copyTemplateFile({
      sourcePath: path.join(adapterSource, name),
      targetPath: path.join(adapterTarget, name),
      replacements
    });
  }

  copyTemplateFile({
    sourcePath: path.join(adapterSource, "costar", "SKILL.md"),
    targetPath: path.join(adapterTarget, "SKILL.md"),
    replacements
  });

  copySamples(repoRoot, adapterTarget);
  renderHostPacket(repoRoot, "codex", path.join(adapterTarget, "PROMPT_PACKET.md"));
  renderSessionProtocol(repoRoot, "codex", path.join(adapterTarget, "SESSION_PROTOCOL.md"));

  return { host: "codex", bundle_dir: adapterTarget, installed: true };
}

function installOpenClawBundle({ repoRoot, targetDir, openClawSkillsDir, skipSmoke }) {
  const adapterSource = path.join(repoRoot, "integrations", "openclaw");
  const adapterTarget = openClawSkillsDir
    ? path.join(openClawSkillsDir, "CoStar")
    : targetDir
      ? path.join(targetDir, "CoStar-OpenClaw")
      : adapterSource;
  ensureSource(adapterSource, "OpenClaw adapter source");

  if (!targetDir && !openClawSkillsDir) {
    return { host: "openclaw", bundle_dir: adapterSource, installed: false };
  }

  ensureDir(adapterTarget);
  const replacements = buildReplacements(repoRoot, adapterTarget);
  for (const name of openClawFiles) {
    copyTemplateFile({
      sourcePath: path.join(adapterSource, name),
      targetPath: path.join(adapterTarget, name),
      replacements
    });
  }

  copyTemplateFile({
    sourcePath: path.join(adapterSource, "CoStar", "SKILL.md"),
    targetPath: path.join(adapterTarget, "SKILL.md"),
    replacements
  });

  const readmeSource = path.join(adapterSource, "CoStar", "README.md");
  if (existsSync(readmeSource)) {
    copyTemplateFile({
      sourcePath: readmeSource,
      targetPath: path.join(adapterTarget, "CoStar.README.md"),
      replacements
    });
  }

  copySamples(repoRoot, adapterTarget);
  renderHostPacket(repoRoot, "openclaw", path.join(adapterTarget, "PROMPT_PACKET.md"));
  renderSessionProtocol(repoRoot, "openclaw", path.join(adapterTarget, "SESSION_PROTOCOL.md"));

  if (!skipSmoke) {
    runNode(repoRoot, path.join(repoRoot, "costar-core", "host-model-adapter", "openclaw-test-pack-smoke.mjs"), []);
    runNode(repoRoot, path.join(repoRoot, "costar-core", "host-model-e2e", "runtime", "host-model-e2e-smoke.mjs"), []);
  }

  return { host: "openclaw", bundle_dir: adapterTarget, installed: true };
}

function buildReplacements(repoRoot, bundleRoot) {
  const bridgeCommand = `node "${path.join(repoRoot, "costar-core", "host-model-adapter", "run-host-tool.mjs")}"`;
  return {
    "{{COSTAR_REPO_ROOT}}": {
      raw: repoRoot,
      json: jsonStringContent(repoRoot)
    },
    "{{CLAUDE_BUNDLE_ROOT}}": {
      raw: bundleRoot,
      json: jsonStringContent(bundleRoot)
    },
    "__COSTAR_REPO_ROOT__": {
      raw: repoRoot,
      json: jsonStringContent(repoRoot)
    },
    "node costar-core/host-model-adapter/run-host-tool.mjs": {
      raw: bridgeCommand,
      json: jsonStringContent(bridgeCommand)
    }
  };
}

function copyTemplateFile({ sourcePath, targetPath, replacements }) {
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing source file: ${sourcePath}`);
  }
  const isText = isTextFile(sourcePath);
  if (!isText) {
    ensureDir(path.dirname(targetPath));
    copyFileSync(sourcePath, targetPath);
    return;
  }

  const ext = path.extname(sourcePath).toLowerCase();
  const isJson = ext === ".json";
  const isJavaScript = ext === ".js" || ext === ".mjs";
  let content = readFileSync(sourcePath, "utf8");
  for (const [token, value] of Object.entries(replacements)) {
    const replacement = isJson || (isJavaScript && token === "__COSTAR_REPO_ROOT__")
      ? value.json
      : value.raw;
    content = content.split(token).join(replacement);
  }

  if (path.basename(sourcePath) === "install-claude-config.ps1") {
    content = content.replace(
      /\[string\]\$RepoRoot = "__COSTAR_REPO_ROOT__"/,
      `[string]$RepoRoot = "${escapePowerShellDoubleQuotedString(replacements["__COSTAR_REPO_ROOT__"].raw)}"`
    );
  }

  writeUtf8NoBom(targetPath, content);
}

function copySamples(repoRoot, adapterTarget) {
  const sampleSource = path.join(repoRoot, "costar-core", "host-model-adapter", "samples");
  const sampleTarget = path.join(adapterTarget, "samples");
  ensureDir(sampleTarget);
  for (const entry of readdirSync(sampleSource, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    copyTemplateFile({
      sourcePath: path.join(sampleSource, entry.name),
      targetPath: path.join(sampleTarget, entry.name),
      replacements: {}
    });
  }
}

function renderHostPacket(repoRoot, host, outputPath) {
  runNode(repoRoot, path.join(repoRoot, "costar-core", "host-model-adapter", "render-host-prompt-packet.mjs"), [
    "--host",
    host,
    "--output",
    outputPath
  ]);
}

function renderSessionProtocol(repoRoot, host, outputPath) {
  runNode(repoRoot, path.join(repoRoot, "costar-core", "host-model-adapter", "render-host-session-protocol.mjs"), [
    "--host",
    host,
    "--output",
    outputPath
  ]);
}

function runNode(cwd, scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status !== 0) {
    throw new Error(`Node script failed: ${scriptPath}\n${result.stderr || result.stdout}`);
  }
}

function readJsonObjectOrDefault(filePath) {
  if (!existsSync(filePath)) {
    return { mcpServers: {} };
  }
  const content = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  if (!content.trim()) {
    return { mcpServers: {} };
  }
  const parsed = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { mcpServers: {} };
  }
  if (!parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) {
    parsed.mcpServers = {};
  }
  return parsed;
}

function setCostarMcpServer(config, runnerPath) {
  if (!config.mcpServers || typeof config.mcpServers !== "object" || Array.isArray(config.mcpServers)) {
    config.mcpServers = {};
  }
  config.mcpServers.costar = {
    command: "node",
    args: [runnerPath]
  };
}

function backupFileIfExists(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  copyFileSync(filePath, `${filePath}.bak`);
}

function writeJsonFile(filePath, value) {
  writeUtf8NoBom(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeUtf8NoBom(filePath, content) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, content, { encoding: "utf8" });
}

function ensureSource(sourcePath, label) {
  if (!existsSync(sourcePath)) {
    throw new Error(`${label} not found: ${sourcePath}`);
  }
}

function ensureDir(dirPath) {
  if (dirPath && !existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

function jsonStringContent(value) {
  const json = JSON.stringify(String(value));
  return json.slice(1, -1);
}

function escapePowerShellDoubleQuotedString(value) {
  return String(value).replace(/`/g, "``").replace(/"/g, '`"').replace(/\$/g, "`$");
}

function isTextFile(filePath) {
  return new Set([".md", ".json", ".mjs", ".js", ".ps1", ".txt", ".yaml", ".yml"]).has(path.extname(filePath).toLowerCase());
}

function requiredString(value, name) {
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required option: ${name}`);
  }
  return value;
}

function resolveUserPath(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  if (text === "~") {
    return os.homedir();
  }
  if (text.startsWith(`~${path.sep}`) || text.startsWith("~/")) {
    return path.join(os.homedir(), text.slice(2));
  }
  return path.resolve(text);
}
