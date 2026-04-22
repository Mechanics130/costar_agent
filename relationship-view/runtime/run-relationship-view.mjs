// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runRelationshipView } from "./relationship-view.mjs";

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!inputPath) {
    throw new Error("Usage: node run-relationship-view.mjs <input.json> [output.json]");
  }

  const request = JSON.parse(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
  const result = await runRelationshipView(request);
  const rendered = `${JSON.stringify(result, null, 2)}\n`;

  if (outputPath) {
    writeFileSync(outputPath, rendered, "utf8");
    console.log(`relationship-view result saved to ${path.resolve(outputPath)}`);
    return;
  }

  process.stdout.write(rendered);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

