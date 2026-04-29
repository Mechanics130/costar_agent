// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildHostConversationSpec } from "./conversation-spec.mjs";

main();

function main() {
  const options = parseArgs(process.argv.slice(2));
  const markdown = renderSessionProtocol(options.host);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, markdown, "utf8");
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  process.stdout.write(markdown);
}

function parseArgs(args) {
  let host = "claude";
  let output = "";

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--host") {
      host = String(args[index + 1] || "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--output") {
      output = String(args[index + 1] || "").trim();
      index += 1;
      continue;
    }
  }

  return { host, output };
}

function renderSessionProtocol(host) {
  const spec = buildHostConversationSpec(host);
  const lines = [
    `# CoStar ${spec.host_name} Session Protocol`,
    "",
    `This file defines how ${spec.host_name} should walk a user through CoStar Host-model mode in a real conversation.`,
    "",
    "## Operating style",
    "",
    `- Tone: ${spec.tone}`,
    `- Emphasis: ${spec.emphasis}`,
    "",
    "## Hard rules",
    ""
  ];

  spec.hard_rules.forEach((rule) => {
    lines.push(`- ${rule}`);
  });

  lines.push("", "## Canonical phases", "");

  spec.phases.forEach((phase, index) => {
    lines.push(`${index + 1}. **${phase.title}**`);
    lines.push(`Goal: ${phase.goal}`);
    lines.push(`Trigger: ${phase.trigger}`);
    lines.push(`Required tools: ${phase.required_tools.map((tool) => `\`${tool}\``).join(", ")}`);
    lines.push("Show the user:");
    phase.user_visible_sections.forEach((item) => {
      lines.push(`- ${item}`);
    });
    lines.push(`Guardrail: ${phase.gating_rule}`);
    lines.push("");
  });

  lines.push(
    "## Minimum conversation contract",
    "",
    "- After ingest, always show a receipt before asking for confirmation.",
    "- If confirmation is required, always show CoStar review cards instead of freeform paraphrases.",
    "- After commit, always show what changed and which durable asset can now be opened.",
    "- If the user asks for briefing or roleplay, generate them from the same committed world.",
    "",
    "## Tool sequence shortcuts",
    "",
    "- Import path: `capture_ingest_sources -> review_prepare_cards -> review_translate_answers -> review_commit_decisions -> view_refresh`",
    "- Briefing path: `profile_get/view_get -> briefing_generate`",
    "- Roleplay path: `profile_get/view_get -> roleplay_generate`",
    "- Graph review path: `graph_get_person/graph_find_path -> review_prepare_cards -> review_translate_answers -> review_commit_decisions`",
    ""
  );

  return `${lines.join("\n")}\n`;
}
