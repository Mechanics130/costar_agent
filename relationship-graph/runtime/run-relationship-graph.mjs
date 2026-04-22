// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runRelationshipGraph } from "./relationship-graph.mjs";

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    throw new Error("用法: node run-relationship-graph.mjs <input.json> [output.json]");
  }

  const request = JSON.parse(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
  const result = await runRelationshipGraph(request);
  const json = `${JSON.stringify(result, null, 2)}\n`;

  if (outputPath) {
    writeFileSync(outputPath, json, "utf8");
    console.log(`relationship-graph result saved to ${path.resolve(outputPath)}`);
    return;
  }

  process.stdout.write(json);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

