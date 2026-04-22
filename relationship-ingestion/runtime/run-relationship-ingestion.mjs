// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runRelationshipIngestion } from "./relationship-ingestion.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..", "..");

const requestPath = process.argv[2];
const outPath = process.argv[3] || "";

if (!requestPath) {
  console.error("Usage: node run-relationship-ingestion.mjs <request-json-path> [output-json-path]");
  process.exit(1);
}

const absoluteRequestPath = path.resolve(process.cwd(), requestPath);
if (!existsSync(absoluteRequestPath)) {
  console.error(`Request file not found: ${absoluteRequestPath}`);
  process.exit(1);
}

const payload = readJsonFile(absoluteRequestPath);
const env = loadEnvFile(path.join(workspaceRoot, "mvp-app", ".env.local"));
const fallbackConfig = {
  apiKey: env.LLM_API_KEY || process.env.LLM_API_KEY || "",
  baseUrl: env.LLM_BASE_URL || process.env.LLM_BASE_URL || "",
  model: env.LLM_MODEL || process.env.LLM_MODEL || "",
  temperature: Number(env.LLM_TEMPERATURE || process.env.LLM_TEMPERATURE || 0.1),
  maxTokens: env.LLM_MAX_TOKENS || process.env.LLM_MAX_TOKENS || ""
};

try {
  const result = await runRelationshipIngestion(payload, fallbackConfig);
  const rendered = `${JSON.stringify(result, null, 2)}\n`;

  if (outPath) {
    const absoluteOutPath = path.resolve(process.cwd(), outPath);
    writeFileSync(absoluteOutPath, rendered, "utf8");
    console.log(`Saved result to ${absoluteOutPath}`);
  } else {
    console.log(rendered);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (error?.details && Object.keys(error.details).length) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(Number(error?.statusCode) || 1);
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const content = readFileSync(filePath, "utf8");
  const result = {};
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      return;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = value;
  });
  return result;
}

function readJsonFile(filePath) {
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

