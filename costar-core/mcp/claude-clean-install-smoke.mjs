// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

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

const tempRoot = mkdtempSync(path.join(os.tmpdir(), "costar-claude-clean-install-"));
const installRoot = path.join(tempRoot, "hosts");
const desktopConfigPath = path.join(tempRoot, "Claude", "claude_desktop_config.json");
const codeProjectRoot = path.join(tempRoot, "project");

try {
  const install = runCli([
    "host",
    "install",
    "claude",
    "--target-dir",
    installRoot
  ], 60000);

  record(install.status === 0, "clean install via CLI exits successfully", install.stderr || install.stdout);

  const bundleDir = path.join(installRoot, "CoStar-Claude");
  const bundleFiles = readdirSync(bundleDir);
  record(bundleFiles.includes("QUICKSTART.md"), "installed bundle includes QUICKSTART.md", JSON.stringify(bundleFiles));
  record(bundleFiles.includes("FIRST_SESSION.md"), "installed bundle includes FIRST_SESSION.md", JSON.stringify(bundleFiles));
  record(bundleFiles.includes("FINAL_USER_ACCEPTANCE.md"), "installed bundle includes FINAL_USER_ACCEPTANCE.md", JSON.stringify(bundleFiles));
  record(bundleFiles.includes("FINAL_USER_RESULTS_TEMPLATE.md"), "installed bundle includes FINAL_USER_RESULTS_TEMPLATE.md", JSON.stringify(bundleFiles));
  record(bundleFiles.includes("install-claude-config.ps1"), "installed bundle includes install-claude-config.ps1", JSON.stringify(bundleFiles));
  record(bundleFiles.includes("doctor-claude-install.mjs"), "installed bundle includes doctor-claude-install.mjs", JSON.stringify(bundleFiles));

  for (const jsonName of ["tool-exposure.json", "claude-desktop.mcp.json", "claude-code.mcp.json", "manifest.json"]) {
    const parsed = parseJsonFile(path.join(bundleDir, jsonName));
    const serialized = JSON.stringify(parsed);
    record(!serialized.includes("{{CLAUDE_BUNDLE_ROOT}}"), `${jsonName} has no unresolved bundle placeholder`, serialized);
    record(!serialized.includes("{{COSTAR_REPO_ROOT}}"), `${jsonName} has no unresolved repo placeholder`, serialized);
  }

  const desktopTemplate = parseJsonFile(path.join(bundleDir, "claude-desktop.mcp.json"));
  record(/run-costar-mcp\.mjs$/i.test(desktopTemplate.mcpServers?.costar?.args?.[0] || ""), "desktop MCP template contains bundle MCP runner path", JSON.stringify(desktopTemplate));
  const codeTemplate = parseJsonFile(path.join(bundleDir, "claude-code.mcp.json"));
  record(/run-costar-mcp\.mjs$/i.test(codeTemplate.mcpServers?.costar?.args?.[0] || ""), "code MCP template contains bundle MCP runner path", JSON.stringify(codeTemplate));
  const manifestTemplate = parseJsonFile(path.join(bundleDir, "manifest.json"));
  record(/run-costar-mcp\.mjs$/i.test(manifestTemplate.transport?.args?.[0] || ""), "manifest contains bundle MCP runner path", JSON.stringify(manifestTemplate.transport || null));
  const toolExposure = parseJsonFile(path.join(bundleDir, "tool-exposure.json"));
  record(toolExposure.bridge_command.includes("run-host-tool.mjs"), "tool exposure bridge command remains valid JSON with bridge path", JSON.stringify(toolExposure.bridge_command));

  const quickstart = readUtf8(path.join(bundleDir, "QUICKSTART.md"));
  record(quickstart.includes("host install claude --apply-config"), "quickstart mentions apply-config path", "");
  record(quickstart.includes("doctor-claude-install.mjs"), "quickstart mentions bundle-local doctor", "");
  record(quickstart.includes("Host does the reasoning; CoStar owns the durable truth."), "quickstart includes durable truth rule", "");

  const firstSession = readUtf8(path.join(bundleDir, "FIRST_SESSION.md"));
  record(firstSession.includes("Use CoStar to import this meeting note"), "first-session guide includes starter import prompt", "");
  record(firstSession.includes("show me the review cards before committing anything"), "first-session guide keeps review before commit", "");
  record(firstSession.includes("Host does the reasoning; CoStar owns the durable truth."), "first-session guide includes durable truth rule", "");

  const finalUserAcceptance = readUtf8(path.join(bundleDir, "FINAL_USER_ACCEPTANCE.md"));
  record(finalUserAcceptance.includes("The user does not need to configure a model API."), "final-user acceptance guide includes hard acceptance 1", "");
  record(finalUserAcceptance.includes("FINAL_USER_RESULTS_TEMPLATE.md"), "final-user acceptance guide points to results template", "");

  const configInstall = spawnSync(
    process.execPath,
    [
      path.join(bundleDir, "install-claude-config.mjs"),
      "--mode",
      "both",
      "--desktop-config-path",
      desktopConfigPath,
      "--claude-code-project-root",
      codeProjectRoot
    ],
    {
      cwd: bundleDir,
      encoding: "utf8"
    }
  );

  record(configInstall.status === 0, "installed bundle config script exits successfully", configInstall.stderr || configInstall.stdout);
  const configResult = JSON.parse(configInstall.stdout);
  record(configResult.updated.includes("desktop"), "installed bundle updates desktop config", JSON.stringify(configResult.updated));
  record(configResult.updated.includes("code"), "installed bundle updates code config", JSON.stringify(configResult.updated));

  const installedDesktopConfig = JSON.parse(readUtf8(desktopConfigPath));
  const installedMcpPath = installedDesktopConfig.mcpServers?.costar?.args?.[0] || "";
  record(/run-costar-mcp\.mjs$/i.test(installedMcpPath), "installed desktop config points at bundle MCP runner", JSON.stringify(installedMcpPath));

  const bundleDoctor = spawnSync(
    process.execPath,
    [
      path.join(bundleDir, "doctor-claude-install.mjs"),
      "--require-config",
      "--desktop-config-path",
      desktopConfigPath,
      "--claude-code-project-root",
      codeProjectRoot
    ],
    {
      cwd: bundleDir,
      encoding: "utf8"
    }
  );
  record(bundleDoctor.status === 0, "installed bundle doctor exits successfully", bundleDoctor.stderr || bundleDoctor.stdout);
  const bundleDoctorJson = JSON.parse(bundleDoctor.stdout);
  record(bundleDoctorJson.status === "passed", "installed bundle doctor reports passed status", JSON.stringify(bundleDoctorJson));

  const initializeResult = await runMcpInitialize(installedMcpPath);
  record(initializeResult?.result?.serverInfo?.name === "costar-host-model", "installed MCP server initializes after clean install", JSON.stringify(initializeResult?.result?.serverInfo || null));
} catch (error) {
  failures.push({
    name: "claude clean install smoke crashed",
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

function runCli(args, timeout = 30000) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout
  });
}

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function parseJsonFile(filePath) {
  return JSON.parse(readUtf8(filePath));
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
        name: "clean-install-smoke",
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
