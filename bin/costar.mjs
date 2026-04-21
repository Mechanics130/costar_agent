#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  init         Create local model config or show bootstrap guidance
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
  costar init --base-url https://api.example.com/v1 --model gpt-4.1 --api-key sk-...
  costar briefing relationship-briefing/samples/relationship-briefing.request.example.json
`);
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
    }
  }
  return values;
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
  const flags = parseInitFlags(args.slice(1));
  if (!flags.baseUrl || !flags.model || !flags.apiKey) {
    console.log("Missing required flags.");
    printHelp();
    process.exit(1);
  }
  writeModelConfig({
    baseUrl: flags.baseUrl,
    model: flags.model,
    apiKey: flags.apiKey,
  });
  console.log("Next: run a sample skill command such as `costar capture <request.json>`.");
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
