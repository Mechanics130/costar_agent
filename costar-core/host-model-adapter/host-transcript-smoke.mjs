// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

for (const host of ["claude", "codex", "openclaw"]) {
  const content = readUtf8(path.join(repoRoot, "integrations", host, "MOCK_TRANSCRIPT.md"));
  record(content.includes("review_prepare_cards"), `${host} transcript uses review_prepare_cards`, "");
  record(content.includes("review_translate_answers"), `${host} transcript uses review_translate_answers`, "");
  record(content.includes("view_refresh"), `${host} transcript uses view_refresh`, "");
  record(content.includes("Commit"), `${host} transcript talks about commit state`, "");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));

function readUtf8(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}
