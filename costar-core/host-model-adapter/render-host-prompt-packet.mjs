// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { listHostModelTools } from "../tools/tool-contract.mjs";

const HOST_CONFIG = {
  claude: {
    title: "CoStar Host-model Prompt Packet for Claude",
    hostLabel: "Claude",
    styleNotes: [
      "Use Claude as the reasoning supervisor, not as a separate source of durable truth.",
      "Always turn high-risk inferences into review candidates before any commit.",
      "Prefer concise user-facing receipts after each tool step."
    ]
  },
  codex: {
    title: "CoStar Host-model Prompt Packet for Codex",
    hostLabel: "Codex",
    styleNotes: [
      "Use Codex as the workflow orchestrator, not as a second CoStar database.",
      "Always use CoStar tools for durable writes and persistent views.",
      "Keep the conversation grounded in receipts, review state, and next actions."
    ]
  },
  openclaw: {
    title: "CoStar Host-model Prompt Packet for OpenClaw",
    hostLabel: "OpenClaw",
    styleNotes: [
      "Use OpenClaw as the host reasoning layer; do not ask the user for a separate model API.",
      "Route all durable relationship writes through CoStar review and commit tools.",
      "Keep the user-facing flow short: receipt, review cards, commit receipt, refreshed view."
    ]
  }
};

main();

function main() {
  const options = parseArgs(process.argv.slice(2));
  const packet = renderPromptPacket(options.host);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, packet, "utf8");
    process.stdout.write(`${outputPath}\n`);
    return;
  }

  process.stdout.write(packet);
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

  if (!(host in HOST_CONFIG)) {
    throw new Error(`Unsupported host: ${host}. Expected one of: ${Object.keys(HOST_CONFIG).join(", ")}`);
  }

  return { host, output };
}

function renderPromptPacket(host) {
  const config = HOST_CONFIG[host];
  const tools = listHostModelTools();
  const reasoningTools = tools.filter((tool) => tool.requires_host_reasoning);
  const deterministicTools = tools.filter((tool) => !tool.requires_host_reasoning);

  const lines = [
    `# ${config.title}`,
    "",
    `This packet defines how ${config.hostLabel} should use CoStar in Host-model mode.`,
    "",
    "## Mission",
    "",
    `${config.hostLabel} is the reasoning and orchestration layer. CoStar remains the durable relationship system of record.`,
    "",
    "## Non-negotiable rules",
    "",
    "- Do not create a second CoStar data world inside the host conversation.",
    "- Do not silently write durable state without going through CoStar commit tools.",
    "- Do not answer high-risk relationship inferences as final truth when CoStar expects review candidates.",
    "- Always preserve the canonical CoStar flow: capture -> review -> commit -> view.",
    "",
    "## Hard acceptance criteria",
    "",
    "- Users should not need to configure a separate model API when using Host-model mode.",
    "- Users must be able to complete the full loop inside the host: import, receive feedback, confirm candidates, commit, and read briefing / graph / view.",
    "- Results must land in the same CoStar store / schema / review system already used by Engine mode.",
    "- Host-model mode must not split CoStar into two separate data worlds.",
    "",
    `## ${config.hostLabel}-specific orchestration notes`,
    "",
    ...config.styleNotes.map((item) => `- ${item}`),
    "",
    "## Tool groups",
    "",
    "### Host reasoning required",
    ""
  ];

  reasoningTools.forEach((tool) => {
    lines.push(`- \`${tool.name}\`: ${tool.purpose}`);
  });

  lines.push("", "### Deterministic / commit tools", "");
  deterministicTools.forEach((tool) => {
    lines.push(`- \`${tool.name}\`: ${tool.purpose}`);
  });

  lines.push(
    "",
    "## Canonical workflow 1: import and update relationship context",
    "",
    "1. Read the user's source material and infer a structured ingestion result.",
    "2. Call `capture_ingest_sources` with:",
    "   - `sources`",
    "   - `host_model`",
    "   - `host_reasoning_output`",
    "3. Present the `user_feedback`, `receipt`, and `confirmation_request` to the user.",
    "4. If candidates need confirmation, call `review_prepare_cards`.",
    "5. Show those review cards to the user and collect explicit decisions.",
    "6. Call `review_translate_answers` to build the canonical commit payload.",
    "7. Call `review_commit_decisions` with that translated payload.",
    "8. Call `view_refresh` after a successful profile commit.",
    "9. Read `view_get`, `profile_get`, or `graph_get_person` from the same stores.",
    "",
    "## Canonical workflow 2: generate a briefing",
    "",
    "1. Read `profile_get` or `view_get` if more context is needed.",
    "2. Infer a structured briefing payload.",
    "3. Call `briefing_generate` with `host_reasoning_output`.",
    "4. Return the CoStar briefing receipt and artifact path if generated.",
    "",
    "## Canonical workflow 3: simulate a conversation",
    "",
    "1. Read the current profile or view if needed.",
    "2. Infer a structured roleplay payload.",
    "3. Call `roleplay_generate` with `host_reasoning_output`.",
    "4. Return the CoStar simulation result without inventing extra durable state.",
    "",
    "## Canonical workflow 4: review graph edges",
    "",
    "1. Call `graph_get_person` or `graph_find_path`.",
    "2. If `review_bundle.edge_candidates` is present, call `review_prepare_cards`.",
    "3. Show the graph review cards to the user and collect explicit decisions.",
    "4. Call `review_translate_answers` to build the canonical graph commit payload.",
    "5. Call `review_commit_decisions` with `target=graph_review`.",
    "",
    "## Structured reasoning requirements",
    "",
    "For tools marked `requires_host_reasoning`, the host must provide `host_reasoning_output` as JSON.",
    "",
    "- `capture_ingest_sources`: provide a relationship-ingestion-shaped result containing `detected_people`, `resolved_people`, and optional `review_bundle`.",
    "- `briefing_generate`: provide `briefing`, plus optional `open_questions` and `notes`.",
    "- `roleplay_generate`: provide `simulation`, optional `coach_feedback`, `open_questions`, and `notes`.",
    "- `review_prepare_cards`: use existing CoStar review candidates and do not invent a new card shape.",
    "- `review_translate_answers`: pass the user's decisions back before any durable write.",
    "",
    "## Receipt discipline",
    "",
    "After every major step, the host should show the user:",
    "",
    "- what CoStar ingested or updated",
    "- whether confirmation is required",
    "- what was committed",
    "- what persistent view or briefing artifact can now be opened",
    "",
    "## Local bridge",
    "",
    "Use the same bridge for all hosts:",
    "",
    "```bash",
    "node costar-core/host-model-adapter/run-host-tool.mjs <request.json>",
    "```",
    "",
    "## Sample request files",
    "",
    "- `costar-core/host-model-adapter/samples/capture-ingest.request.example.json`",
    "- `costar-core/host-model-adapter/samples/briefing-generate.request.example.json`",
    "- `costar-core/host-model-adapter/samples/roleplay-generate.request.example.json`",
    "- `costar-core/host-model-adapter/samples/review-protocol.profile-input.example.json`",
    "- `costar-core/host-model-adapter/samples/review-protocol.profile-answer.example.json`",
    "- `costar-core/host-model-adapter/samples/review-protocol.graph-input.example.json`",
    "- `costar-core/host-model-adapter/samples/review-protocol.graph-answer.example.json`",
    ""
  );

  return `${lines.join("\n")}\n`;
}
