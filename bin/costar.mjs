#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  applyClaudeConfig,
  defaultCodexSkillsDir,
  defaultHostTargetDir,
  hostInstallFolder,
  installHostBundle
} from "../costar-core/host-install/host-installer.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`CoStar CLI

Usage:
  costar <command> [args]

Commands:
  init         Create local model config with a wizard or env defaults
  host         Install or validate host-model adapters
  capture      Run relationship-capture
  ingestion    Run relationship-ingestion
  profile      Run relationship-profile
  briefing     Run relationship-briefing
  roleplay     Run relationship-roleplay
  graph        Run relationship-graph
  view         Run relationship-view
  doctor       Run repository checks
  help         Show this help

Examples:
  costar init
  costar init --base-url https://api.example.com/v1 --model gpt-4.1 --api-key sk-...
  costar host install claude
  costar host install claude --apply-config
  costar host doctor claude
  costar host install codex --apply-skill
  costar host install openclaw
  costar briefing relationship-briefing/samples/relationship-briefing.request.example.json

Host-model mode:
  costar host install claude
  costar host install claude --apply-config
  costar host doctor claude
  costar host install codex --apply-skill
  costar host install openclaw
`);
}

function trimOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getEnvDefault(names) {
  for (const name of names) {
    const value = trimOrEmpty(process.env[name]);
    if (value) {
      return value;
    }
  }
  return "";
}

function writeModelConfig(values) {
  const configPath = path.join(repoRoot, "relationship-ingestion", "runtime", "model-config.local.json");
  const configDir = path.dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const config = {
    provider: "openai-compatible",
    base_url: values.baseUrl,
    model: values.model,
    api_key: values.apiKey,
    temperature: 0.1,
    source: "costar init",
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Wrote model config: ${configPath}`);
}

function parseInitFlags(rest) {
  const values = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    const next = rest[i + 1];
    if (token === "--base-url") {
      values.baseUrl = next;
      i += 1;
    } else if (token === "--model") {
      values.model = next;
      i += 1;
    } else if (token === "--api-key") {
      values.apiKey = next;
      i += 1;
    } else if (token === "--yes" || token === "-y") {
      values.yes = true;
    }
  }
  return values;
}

function promptLine(rl, label, fallback) {
  const suffix = fallback ? ` [${fallback}]` : "";
  return new Promise((resolve) => {
    rl.question(`${label}${suffix}: `, (answer) => {
      const value = answer.trim();
      resolve(value || fallback || "");
    });
  });
}

function promptSecret(label, fallback) {
  if (!process.stdin.isTTY) {
    return Promise.resolve(fallback || "");
  }
  return new Promise((resolve) => {
    process.stdout.write(`${label}${fallback ? " [keep existing]" : ""}: `);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let buffer = "";

    const finish = (value) => {
      stdin.off("data", onData);
      if (typeof wasRaw === "boolean") {
        stdin.setRawMode(wasRaw);
      }
      process.stdout.write("\n");
      resolve(value);
    };

    const onData = (chunk) => {
      const char = chunk.toString("utf8");
      if (char === "\u0003") {
        stdin.off("data", onData);
        process.exit(130);
      }
      if (char === "\r" || char === "\n") {
        finish(buffer.trim() || fallback || "");
        return;
      }
      if (char === "\u007f" || char === "\b") {
        buffer = buffer.slice(0, -1);
        return;
      }
      if (char === "\u001b") {
        return;
      }
      buffer += char;
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function runInit(rest) {
  const flags = parseInitFlags(rest);
  const envDefaults = {
    baseUrl: getEnvDefault(["OPENAI_BASE_URL", "COSTAR_BASE_URL"]),
    model: getEnvDefault(["OPENAI_MODEL", "COSTAR_MODEL"]),
    apiKey: getEnvDefault(["OPENAI_API_KEY", "COSTAR_API_KEY"]),
  };

  const directConfig = flags.baseUrl && flags.model && flags.apiKey;
  if (directConfig) {
    writeModelConfig({
      baseUrl: flags.baseUrl,
      model: flags.model,
      apiKey: flags.apiKey,
    });
    console.log("Next: run a sample skill command such as `costar capture <request.json>`.");
    return;
  }

  if (!process.stdin.isTTY) {
    const missing = [];
    if (!envDefaults.baseUrl) missing.push("--base-url / OPENAI_BASE_URL");
    if (!envDefaults.model) missing.push("--model / OPENAI_MODEL");
    if (!envDefaults.apiKey) missing.push("--api-key / OPENAI_API_KEY");
    if (missing.length > 0) {
      console.error(`Missing required config values: ${missing.join(", ")}`);
      printHelp();
      process.exit(1);
    }
    writeModelConfig({
      baseUrl: envDefaults.baseUrl,
      model: envDefaults.model,
      apiKey: envDefaults.apiKey,
    });
    console.log("Next: run a sample skill command such as `costar capture <request.json>`.");
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const baseUrl = flags.baseUrl || (await promptLine(rl, "OpenAI-compatible base URL", envDefaults.baseUrl || "https://api.example.com/v1"));
    const model = flags.model || (await promptLine(rl, "Model name", envDefaults.model || "your-model-name"));
    const apiKey = flags.apiKey || (await promptSecret("API key", envDefaults.apiKey));

    if (!baseUrl || !model || !apiKey) {
      console.error("Missing required config values.");
      printHelp();
      process.exit(1);
    }

    writeModelConfig({
      baseUrl,
      model,
      apiKey,
    });
    console.log("Next: run a sample skill command such as `costar capture <request.json>`.");
  } finally {
    rl.close();
  }
}

function runScript(script, scriptArgs) {
  const abs = path.join(repoRoot, script);
  const result = spawnSync(process.execPath, [abs, ...scriptArgs], {
    stdio: "inherit",
    cwd: repoRoot,
  });
  process.exit(result.status ?? 1);
}

function runNodeScriptCapture(script, scriptArgs = []) {
  const abs = path.join(repoRoot, script);
  return spawnSync(process.execPath, [abs, ...scriptArgs], {
    stdio: "inherit",
    cwd: repoRoot,
  });
}

function parseFlag(rest, names, fallback = "") {
  for (let i = 0; i < rest.length; i += 1) {
    if (names.includes(rest[i])) {
      return rest[i + 1] || fallback;
    }
  }
  return fallback;
}

function hasFlag(rest, names) {
  return rest.some((item) => names.includes(item));
}

function hostBootstrapScript(host) {
  const scripts = {
    claude: "integrations/claude/bootstrap-claude.ps1",
    codex: "integrations/codex/bootstrap-codex.ps1",
    openclaw: "integrations/openclaw/bootstrap-costar.ps1",
  };
  return scripts[host] || "";
}

function printHostHelp() {
  console.log(`CoStar host commands

Usage:
  costar host install <claude|codex|openclaw> [--target-dir <path>]
  costar host install claude [--apply-config] [--mode <desktop|code|both>]
  costar host install codex [--apply-skill] [--codex-skills-dir <codex-skills-dir>]
  costar host doctor <claude|codex|openclaw>
  costar host where <claude|codex|openclaw>

Examples:
  costar host install claude
  costar host install claude --target-dir <host-tools-dir>
  costar host install claude --apply-config
  costar host install codex --apply-skill
  costar host install codex --codex-skills-dir <codex-skills-dir>
  costar host doctor claude
  costar host install openclaw --openclaw-skills-dir <openclaw-skills-dir>
  costar host where claude
`);
}

function runChecksSequentially(checks) {
  for (const check of checks) {
    const result = runNodeScriptCapture(check, []);
    if ((result.status ?? 1) !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

function runHostCommand(rest) {
  const subcommand = trimOrEmpty(rest[0]).toLowerCase();
  const host = trimOrEmpty(rest[1]).toLowerCase();

  if (!subcommand || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
    printHostHelp();
    process.exit(0);
  }

  if (!["claude", "codex", "openclaw"].includes(host)) {
    console.error(`Unknown or missing host target: ${host || "<empty>"}`);
    printHostHelp();
    process.exit(1);
  }

  if (subcommand === "where") {
    const flags = rest.slice(2);
    const installRoot = parseFlag(flags, ["--target-dir"], defaultHostTargetDir());
    const codexSkillsDir = parseFlag(flags, ["--codex-skills-dir"], "");
    const openClawSkillsDir = parseFlag(flags, ["--openclaw-skills-dir"], "");
    const installFolder = hostInstallFolder(host, { codexSkillsDir, openClawSkillsDir });
    console.log(JSON.stringify({
      host,
      repo_root: repoRoot,
      installer: "node",
      legacy_bootstrap_script: path.join(repoRoot, hostBootstrapScript(host)),
      suggested_install_dir: codexSkillsDir
        ? path.join(codexSkillsDir, installFolder)
        : openClawSkillsDir
          ? path.join(openClawSkillsDir, installFolder)
          : path.join(installRoot, installFolder),
      default_codex_skills_dir: host === "codex" ? defaultCodexSkillsDir() : null,
      bridge_command: path.join(repoRoot, "costar-core", "host-model-adapter", "run-host-tool.mjs"),
      mcp_server: host === "claude" ? path.join(repoRoot, "costar-core", "mcp", "costar-mcp-server.mjs") : null,
    }, null, 2));
    process.exit(0);
  }

  if (subcommand === "install") {
    const flags = rest.slice(2);
    const targetDir = parseFlag(flags, ["--target-dir"], defaultHostTargetDir());
    const codexSkillsDir = parseFlag(
      flags,
      ["--codex-skills-dir"],
      host === "codex" && hasFlag(flags, ["--apply-skill"]) ? defaultCodexSkillsDir() : ""
    );
    const openClawSkillsDir = parseFlag(flags, ["--openclaw-skills-dir"], "");
    const installResult = installHostBundle({
      host,
      repoRoot,
      targetDir,
      codexSkillsDir,
      openClawSkillsDir,
      skipSmoke: hasFlag(flags, ["--skip-smoke"])
    });
    const installedBundleDir = installResult.bundle_dir;

    if (host === "claude" && hasFlag(flags, ["--apply-config"])) {
      const configResult = applyClaudeConfig({
        repoRoot,
        bundleDir: installedBundleDir,
        mode: parseFlag(flags, ["--mode"], "both"),
        desktopConfigPath: parseFlag(flags, ["--desktop-config-path"], ""),
        claudeCodeProjectRoot: parseFlag(flags, ["--claude-code-project-root"], repoRoot)
      });
      console.log(JSON.stringify(configResult, null, 2));
    }

    console.log(`Installed ${host} bundle: ${installedBundleDir}`);
    if (host === "claude") {
      console.log(`Next: open ${path.join(installedBundleDir, "QUICKSTART.md")}`);
      console.log(`Then run: node "${path.join(installedBundleDir, "doctor-claude-install.mjs")}" --require-config`);
    } else if (host === "codex") {
      console.log(`Next: open ${path.join(installedBundleDir, "SKILL.md")}`);
      console.log("Codex should discover the bundled costar skill after the skills directory is refreshed.");
    } else if (host === "openclaw") {
      console.log(`Next: open ${path.join(installedBundleDir, "README.md")}`);
      console.log("OpenClaw should use the bundled SKILL.md as the host-model skill entrypoint.");
    }
    process.exit(0);
  }

  if (subcommand === "doctor") {
    const checksByHost = {
      claude: [
        "costar-core/mcp/mcp-smoke.mjs",
        "costar-core/mcp/claude-bootstrap-smoke.mjs",
        "costar-core/host-model-adapter/claude-test-pack-smoke.mjs",
        "costar-core/host-model-adapter/host-transcript-smoke.mjs",
        "costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs",
      ],
      codex: [
        "costar-core/host-model-adapter/codex-test-pack-smoke.mjs",
        "costar-core/host-model-adapter/host-transcript-smoke.mjs",
        "costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs",
      ],
      openclaw: [
        "costar-core/host-model-adapter/openclaw-test-pack-smoke.mjs",
        "costar-core/host-model-adapter/openclaw-bootstrap-smoke.mjs",
        "costar-core/host-model-adapter/host-transcript-smoke.mjs",
        "costar-core/host-model-e2e/runtime/host-model-e2e-smoke.mjs",
      ],
    };
    runChecksSequentially(checksByHost[host]);
    console.log(`CoStar host doctor passed for ${host}.`);
    process.exit(0);
  }

  console.error(`Unknown host subcommand: ${subcommand}`);
  printHostHelp();
  process.exit(1);
}

if (!command || command === "--help" || command === "-h" || command === "help") {
  printHelp();
  process.exit(0);
}

if (command === "doctor") {
  runScript("scripts/check-public-repo.mjs", []);
}

if (command === "init") {
  await runInit(args.slice(1));
  process.exit(0);
}

if (command === "host") {
  runHostCommand(args.slice(1));
}

const commandMap = {
  capture: "relationship-capture/runtime/run-relationship-capture.mjs",
  ingestion: "relationship-ingestion/runtime/run-relationship-ingestion.mjs",
  profile: "relationship-profile/runtime/run-relationship-profile.mjs",
  briefing: "relationship-briefing/runtime/run-relationship-briefing.mjs",
  roleplay: "relationship-roleplay/runtime/run-relationship-roleplay.mjs",
  graph: "relationship-graph/runtime/run-relationship-graph.mjs",
  view: "relationship-view/runtime/run-relationship-view.mjs",
};

if (!commandMap[command]) {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

runScript(commandMap[command], args.slice(1));


