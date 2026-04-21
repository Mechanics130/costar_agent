// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runRelationshipBriefing } from "./relationship-briefing.mjs";

function resolvePath(rawValue) {
  if (!rawValue) {
    return null;
  }
  return path.resolve(process.cwd(), rawValue);
}

async function main() {
  const inputPath = resolvePath(process.argv[2]);
  const outputPath = resolvePath(process.argv[3]);

  if (!inputPath) {
    console.error("Usage: node run-relationship-briefing.mjs <request.json> [output.json]");
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
  const result = await runRelationshipBriefing(payload);
  const rendered = `${JSON.stringify(result, null, 2)}\n`;

  if (outputPath) {
    writeFileSync(outputPath, rendered, "utf8");
    console.log(`briefing result written to ${outputPath}`);
  } else {
    console.log(rendered);
  }
}

main();

