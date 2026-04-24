#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const bundleRoot = __dirname;
const defaultDesktopConfigPath = getDefaultDesktopConfigPath();
const desktopConfigPath = parseFlag("--desktop-config-path", defaultDesktopConfigPath);
const claudeCodeProjectRoot = parseFlag("--claude-code-project-root", "");
const requireConfig = args.includes("--require-config");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

const bundleMcpRunner = path.join(bundleRoot, "run-costar-mcp.mjs");
const requiredFiles = [
  "README.md",
  "QUICKSTART.md",
  "FIRST_SESSION.md",
  "install-claude-config.ps1",
  "install-claude-config.mjs",
  "doctor-claude-install.mjs",
  "run-costar-mcp.mjs",
  "PROMPT_PACKET.md",
  "SESSION_PROTOCOL.md"
];

try {
  for (const file of requiredFiles) {
    record(existsSync(path.join(bundleRoot, file)), `bundle includes ${file}`, file);
  }

  if (existsSync(desktopConfigPath)) {
    const desktopConfig = readJson(desktopConfigPath);
    verifyConfigShape(desktopConfig, "desktop config", bundleMcpRunner);
  } else if (requireConfig) {
    record(false, "desktop config exists", desktopConfigPath);
  } else {
    record(true, "desktop config optional check skipped", desktopConfigPath);
  }

  const codeConfigPath = claudeCodeProjectRoot ? path.join(claudeCodeProjectRoot, ".mcp.json") : "";
  if (codeConfigPath && existsSync(codeConfigPath)) {
    const codeConfig = readJson(codeConfigPath);
    verifyConfigShape(codeConfig, "Claude Code config", bundleMcpRunner);
  } else if (codeConfigPath && requireConfig) {
    record(false, "Claude Code config exists", codeConfigPath);
  } else if (codeConfigPath) {
    record(true, "Claude Code config optional check skipped", codeConfigPath);
  }

  const initializeResult = await runMcpInitialize(bundleMcpRunner);
  record(initializeResult?.result?.serverInfo?.name === "costar-host-model", "bundle MCP runner initializes", JSON.stringify(initializeResult?.result?.serverInfo || null));
} catch (error) {
  failures.push({
    name: "doctor-claude-install crashed",
    detail: String(error?.stack || error)
  });
}

if (failures.length) {
  console.error(JSON.stringify({
    status: "failed",
    bundle_root: bundleRoot,
    checks,
    failures
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "passed",
  bundle_root: bundleRoot,
  checks
}, null, 2));

function parseFlag(name, fallback = "") {
  const index = args.indexOf(name);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] || fallback;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function verifyConfigShape(config, label, expectedRunner) {
  const server = config?.mcpServers?.costar;
  record(Boolean(server), `${label} includes costar server`, JSON.stringify(server || null));
  record(server?.command === "node", `${label} uses node command`, JSON.stringify(server?.command || null));
  const runnerPath = server?.args?.[0] || "";
  record(normalizeComparablePath(runnerPath) === normalizeComparablePath(expectedRunner), `${label} points at installed bundle MCP runner`, JSON.stringify(runnerPath));
}

function normalizeComparablePath(value) {
  const normalized = path.normalize(String(value || ""));
  if (process.platform === "win32") {
    return normalized.replace(/\//g, "\\").toLowerCase();
  }
  return normalized.replace(/\\/g, "/");
}

function getDefaultDesktopConfigPath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Claude", "claude_desktop_config.json");
}

async function runMcpInitialize(serverPath) {
  const child = spawn(process.execPath, [serverPath], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  let stdoutBuffer = Buffer.alloc(0);
  const responses = [];

  child.stdout.on("data", (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    let parsed;
    do {
      parsed = tryReadMessage(stdoutBuffer);
      if (parsed) {
        stdoutBuffer = parsed.rest;
        responses.push(parsed.message);
      }
    } while (parsed);
  });

  child.stdin.write(encodeMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "doctor-claude-install",
        version: "0.1.0"
      }
    }
  }));

  const response = await waitForResponse(responses, 1);
  child.kill();
  return response;
}

async function waitForResponse(responses, id, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = responses.find((item) => item.id === id);
    if (response) {
      return response;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

function encodeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, body]);
}

function tryReadMessage(buffer) {
  const separator = buffer.indexOf("\r\n\r\n");
  if (separator === -1) {
    return null;
  }
  const headerText = buffer.slice(0, separator).toString("utf8");
  const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);
  if (!lengthMatch) {
    return null;
  }
  const bodyLength = Number(lengthMatch[1]);
  const bodyStart = separator + 4;
  const bodyEnd = bodyStart + bodyLength;
  if (buffer.length < bodyEnd) {
    return null;
  }
  return {
    message: JSON.parse(buffer.slice(bodyStart, bodyEnd).toString("utf8")),
    rest: buffer.slice(bodyEnd)
  };
}
