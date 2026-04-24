// SPDX-License-Identifier: Apache-2.0
import process from "node:process";
import { getHostModelToolDefinition, listHostModelTools } from "../tools/tool-contract.mjs";
import { runHostModelTool } from "../tools/host-model-dispatcher.mjs";

const SERVER_INFO = {
  name: "costar-host-model",
  version: "0.1.0"
};

const DEFAULT_PROTOCOL_VERSION = "2025-03-26";

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

async function main() {
  const stdin = process.stdin;
  let buffer = Buffer.alloc(0);

  stdin.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    let parsed;
    do {
      parsed = tryReadMessage(buffer);
      if (parsed) {
        buffer = parsed.rest;
        void handleMessage(parsed.message);
      }
    } while (parsed);
  });

  stdin.resume();
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  if (!("id" in message)) {
    return;
  }

  const method = String(message.method || "");
  try {
    if (method === "initialize") {
      sendResult(message.id, {
        protocolVersion: normalizeString(message.params?.protocolVersion) || DEFAULT_PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: SERVER_INFO
      });
      return;
    }

    if (method === "tools/list") {
      sendResult(message.id, {
        tools: listHostModelTools().map((tool) => ({
          name: tool.name,
          description: tool.purpose,
          inputSchema: buildToolInputSchema(tool.name)
        }))
      });
      return;
    }

    if (method === "tools/call") {
      const toolName = normalizeString(message.params?.name);
      const args = message.params?.arguments && typeof message.params.arguments === "object"
        ? message.params.arguments
        : {};
      const result = await Promise.resolve(
        runHostModelTool({
          tool_name: toolName,
          tool_input: args
        })
      );
      sendResult(message.id, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ],
        structuredContent: result,
        isError: false
      });
      return;
    }

    sendError(message.id, -32601, `Unsupported method: ${method}`);
  } catch (error) {
    sendResult(message.id, {
      content: [
        {
          type: "text",
          text: String(error?.message || error)
        }
      ],
      isError: true
    });
  }
}

function buildToolInputSchema(toolName) {
  const definition = getHostModelToolDefinition(toolName);
  const required = Array.isArray(definition?.input_contract?.required)
    ? definition.input_contract.required
    : [];
  const optional = Array.isArray(definition?.input_contract?.optional)
    ? definition.input_contract.optional
    : [];
  const properties = {};

  [...required, ...optional].forEach((field) => {
    properties[field] = {
      description: `${field} field for ${toolName}`,
      type: guessFieldType(field)
    };
  });

  return {
    type: "object",
    properties,
    required,
    additionalProperties: true
  };
}

function guessFieldType(field) {
  const normalized = normalizeString(field).toLowerCase();
  if (normalized.endsWith("_path")) {
    return "string";
  }
  if (normalized.includes("people") || normalized.includes("sources") || normalized.includes("answers")) {
    return "array";
  }
  if (normalized.includes("result") || normalized.includes("output") || normalized === "options" || normalized === "filters") {
    return "object";
  }
  return ["string", "object", "array", "boolean", "number", "null"];
}

function tryReadMessage(buffer) {
  const separator = buffer.indexOf("\r\n\r\n");
  if (separator === -1) {
    return null;
  }

  const headerText = buffer.slice(0, separator).toString("utf8");
  const lengthMatch = /Content-Length:\s*(\d+)/i.exec(headerText);
  if (!lengthMatch) {
    throw new Error("Missing Content-Length header.");
  }

  const bodyLength = Number(lengthMatch[1]);
  const bodyStart = separator + 4;
  const bodyEnd = bodyStart + bodyLength;
  if (buffer.length < bodyEnd) {
    return null;
  }

  const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
  return {
    message: JSON.parse(body),
    rest: buffer.slice(bodyEnd)
  };
}

function sendResult(id, result) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  });
}

function sendMessage(payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}`, "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  process.stdout.write(Buffer.concat([header, body]));
}

function normalizeString(value) {
  return String(value ?? "").trim();
}
