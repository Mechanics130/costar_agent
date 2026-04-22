#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import readline from "node:readline";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args[0];

function printHelp() {
  console.log(`CoStar CLI

Usage:
  costar <command> [args]

Commands:
  init         Create local model config with a wizard or env defaults
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
  costar briefing relationship-briefing/samples/relationship-briefing.request.example.json
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


