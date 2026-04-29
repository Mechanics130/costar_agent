// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const renderScript = path.join(__dirname, "render-host-prompt-packet.mjs");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

for (const host of ["claude", "codex", "openclaw"]) {
  const result = spawnSync(process.execPath, [renderScript, "--host", host], {
    cwd: path.resolve(__dirname, "..", ".."),
    encoding: "utf8"
  });
  record(result.status === 0, `${host} prompt packet renders`, result.stderr || "");
  const output = result.stdout || "";
  record(output.includes("Do not create a second CoStar data world"), `${host} packet guards single data world`, "");
  record(output.includes("review_commit_decisions"), `${host} packet mentions commit tool`, "");
  record(output.includes("review_prepare_cards"), `${host} packet mentions review card tool`, "");
  record(output.includes("review_translate_answers"), `${host} packet mentions review translation tool`, "");
  record(output.includes("capture_ingest_sources"), `${host} packet mentions capture tool`, "");
  record(output.includes("briefing_generate"), `${host} packet mentions briefing tool`, "");
  record(output.includes("roleplay_generate"), `${host} packet mentions roleplay tool`, "");
  record(output.includes("compiled_truth.latent_needs"), `${host} packet preserves latent needs`, "");
  record(output.includes("compiled_truth.key_issues"), `${host} packet preserves key issues`, "");
  record(output.includes("compiled_truth.attitude_intent"), `${host} packet preserves attitude intent`, "");
  record(output.includes("source_id") && output.includes("source_title"), `${host} packet preserves source identity`, "");
  record(output.includes("person_self"), `${host} packet defines self graph node`, "");
  record(output.includes("Profile tier glossary"), `${host} packet includes profile tier glossary`, "");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
