// SPDX-License-Identifier: Apache-2.0
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildHostConversationSpec } from "./conversation-spec.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const renderScript = path.join(__dirname, "render-host-session-protocol.mjs");

const checks = [];
const failures = [];

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

for (const host of ["claude", "codex"]) {
  const spec = buildHostConversationSpec(host);
  record(spec.phases.length >= 6, `${host} session spec exposes phase list`, `phases=${spec.phases.length}`);
  record(spec.hard_rules.some((rule) => rule.includes("second CoStar data world")), `${host} session spec guards data world split`, "");
  record(spec.phases.some((phase) => phase.phase_id === "profile_review"), `${host} session spec contains profile review phase`, "");
  record(spec.phases.some((phase) => phase.phase_id === "graph_review"), `${host} session spec contains graph review phase`, "");
  record(spec.phases.some((phase) => phase.phase_id === "view_refresh"), `${host} session spec contains view refresh phase`, "");

  const render = spawnSync(process.execPath, [renderScript, "--host", host], {
    cwd: path.resolve(__dirname, "..", ".."),
    encoding: "utf8"
  });
  record(render.status === 0, `${host} session protocol renders`, render.stderr || "");
  const output = render.stdout || "";
  record(output.includes("review_prepare_cards"), `${host} session protocol mentions review card tool`, "");
  record(output.includes("review_translate_answers"), `${host} session protocol mentions review translation tool`, "");
  record(output.includes("view_refresh"), `${host} session protocol mentions view refresh`, "");
}

if (failures.length) {
  console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", checks }, null, 2));
