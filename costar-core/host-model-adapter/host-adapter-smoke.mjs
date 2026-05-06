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
  record(output.includes("memory_feedback_record"), `${host} packet mentions memory feedback tool`, "");
  record(output.includes("memory_feedback_report"), `${host} packet mentions memory feedback report tool`, "");
  record(output.includes("Experimental, disabled by default: turn pending memory reflection candidates"), `${host} packet marks memory reflection cards tool experimental`, "");
  record(output.includes("Experimental, disabled by default: commit user-confirmed reflection candidates"), `${host} packet marks memory reflection commit experimental`, "");
  record(output.includes("Experimental, disabled by default: retrieve confirmed extraction hints"), `${host} packet marks memory hints experimental`, "");
  record(!output.includes("call `memory_reflection_prepare_cards`"), `${host} default workflow does not call memory reflection cards`, "");
  record(!output.includes("call `memory_reflection_commit`"), `${host} default workflow does not call memory reflection commit`, "");
  record(!output.includes("call `memory_hints_get`"), `${host} default workflow does not call memory hints`, "");
  record(output.includes("record feedback and measure quality"), `${host} packet frames feedback as quality measurement`, "");
  record(output.includes("experimental and disabled by default"), `${host} packet explains reflection and hints are disabled by default`, "");
  record(output.includes("capture_ingest_sources"), `${host} packet mentions capture tool`, "");
  record(output.includes("briefing_generate"), `${host} packet mentions briefing tool`, "");
  record(output.includes("roleplay_generate"), `${host} packet mentions roleplay tool`, "");
  record(output.includes("compiled_truth.latent_needs"), `${host} packet preserves latent needs`, "");
  record(output.includes("compiled_truth.key_issues"), `${host} packet preserves key issues`, "");
  record(output.includes("compiled_truth.attitude_intent"), `${host} packet preserves attitude intent`, "");
  record(output.includes("## Extraction Policy"), `${host} packet includes forced extraction policy`, "");
  record(output.includes("extract every signal the source provides"), `${host} packet rejects underextraction`, "");
  record(output.includes("coverage line per person"), `${host} packet asks for per-person extraction coverage`, "");
  record(output.includes("Underextraction is worse than slight overextraction with confidence flags"), `${host} packet prioritizes source-backed coverage`, "");
  record(output.includes("人名严格按原文字符复制"), `${host} packet includes Chinese entity exact-copy rule`, "");
  record(output.includes("weak_evidence"), `${host} packet preserves weak evidence for uncertain Chinese entities`, "");
  record(output.includes("source_id") && output.includes("source_title"), `${host} packet preserves source identity`, "");
  record(output.includes("person_self"), `${host} packet defines self graph node`, "");
  record(output.includes("Profile tier glossary"), `${host} packet includes profile tier glossary`, "");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
