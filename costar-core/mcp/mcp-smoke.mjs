// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, "costar-mcp-server.mjs");

const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"]
});

const responses = [];
const failures = [];
const checks = [];
let stdoutBuffer = Buffer.alloc(0);
let requestId = 0;

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

child.stderr.on("data", (chunk) => {
  failures.push(`stderr: ${chunk.toString("utf8")}`);
});

await sendRequest("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: {
    name: "costar-smoke",
    version: "0.1.0"
  }
});

const init = await waitForResponse(1);
record(init?.result?.serverInfo?.name === "costar-host-model", "initialize returns server info", JSON.stringify(init?.result?.serverInfo || null));
record(init?.result?.protocolVersion === "2025-03-26", "initialize returns negotiated protocol version", JSON.stringify(init?.result?.protocolVersion || null));

await sendRequest("tools/list", {});
const list = await waitForResponse(2);
record(Array.isArray(list?.result?.tools) && list.result.tools.length >= 14, "tools/list returns CoStar tools", JSON.stringify(list?.result?.tools?.length ?? null));
record(list?.result?.tools?.some((tool) => tool.name === "capture_ingest_sources"), "tools/list includes capture_ingest_sources", "");

await sendRequest("tools/call", {
  name: "review_list_candidates",
  arguments: {}
});
const call = await waitForResponse(3);
record(call?.result?.isError === false, "tools/call returns success envelope", JSON.stringify(call?.result?.isError ?? null));
record(/review_candidates/.test(call?.result?.content?.[0]?.text || ""), "tools/call serializes tool output", "");

child.kill();

if (failures.length || checks.some((item) => !item.ok)) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));

async function sendRequest(method, params) {
  requestId += 1;
  const payload = {
    jsonrpc: "2.0",
    id: requestId,
    method,
    params
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  child.stdin.write(Buffer.concat([header, body]));
  await sleep(50);
}

async function waitForResponse(id, timeoutMs = 3000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const response = responses.find((item) => item.id === id);
    if (response) {
      return response;
    }
    await sleep(20);
  }
  failures.push(`timeout waiting for response ${id}`);
  return null;
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

function record(ok, name, detail) {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push(`${name}: ${detail}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
