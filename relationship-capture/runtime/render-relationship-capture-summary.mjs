// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderRelationshipCaptureSummaryMarkdown } from "./relationship-capture.mjs";

const inputPath = process.argv[2];
const outputPath = process.argv[3];
const explicitTitle = process.argv[4] || "";

if (!inputPath || !outputPath) {
  console.error("Usage: node render-relationship-capture-summary.mjs <response-json-path> <output-md-path> [title]");
  process.exit(1);
}

const absoluteInputPath = path.resolve(process.cwd(), inputPath);
const absoluteOutputPath = path.resolve(process.cwd(), outputPath);

if (!existsSync(absoluteInputPath)) {
  console.error(`Input file not found: ${absoluteInputPath}`);
  process.exit(1);
}

const result = JSON.parse(readFileSync(absoluteInputPath, "utf8").replace(/^\uFEFF/, ""));
const title = explicitTitle || deriveTitle(absoluteOutputPath);
const rendered = renderRelationshipCaptureSummaryMarkdown(result, { title });

writeFileSync(absoluteOutputPath, rendered, "utf8");
console.log(`Saved summary to ${absoluteOutputPath}`);

function deriveTitle(filePath) {
  const baseName = path.basename(filePath, path.extname(filePath));
  return baseName
    .replace(/^relationship-capture\./i, "")
    .replace(/\./g, " ")
    .trim();
}

