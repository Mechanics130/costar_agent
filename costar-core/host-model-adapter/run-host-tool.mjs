// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { runHostModelTool } from "../tools/host-model-dispatcher.mjs";

async function main() {
  const request = readRequest(process.argv.slice(2));
  const result = await Promise.resolve(runHostModelTool(request));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function readRequest(args) {
  const requestPath = args[0];
  if (!requestPath) {
    throw new Error("Usage: node costar-core/host-model-adapter/run-host-tool.mjs <request.json>");
  }

  const absolutePath = path.resolve(requestPath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Request file not found: ${absolutePath}`);
  }

  const raw = readFileSync(absolutePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Host tool request must be a JSON object.");
  }
  return parsed;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
