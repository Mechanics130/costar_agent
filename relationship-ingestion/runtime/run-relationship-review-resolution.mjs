// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runRelationshipReviewResolution } from "./relationship-review-resolution.mjs";

function resolveInputPath(rawValue) {
  if (!rawValue) {
    return null;
  }
  return path.resolve(process.cwd(), rawValue);
}

function main() {
  const inputPath = resolveInputPath(process.argv[2]);
  const outputPath = resolveInputPath(process.argv[3]);

  if (!inputPath) {
    console.error("Usage: node run-relationship-review-resolution.mjs <request.json> [output.json]");
    process.exit(1);
  }

  const payload = readJsonFile(inputPath);
  const result = runRelationshipReviewResolution(payload);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;

  if (outputPath) {
    writeFileSync(outputPath, serialized, "utf8");
    console.log(`review resolution result written to ${outputPath}`);
  } else {
    console.log(serialized);
  }
}

main();

function readJsonFile(filePath) {
  const raw = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

