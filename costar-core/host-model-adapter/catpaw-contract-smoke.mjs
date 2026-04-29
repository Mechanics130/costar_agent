// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getHostModelToolDefinition } from "../tools/tool-contract.mjs";
import { runHostModelTool } from "../tools/host-model-dispatcher.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const renderPromptPacketScript = path.join(__dirname, "render-host-prompt-packet.mjs");
const checks = [];
const failures = [];
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "costar-catpaw-contract-"));

function record(ok, name, detail = "") {
  checks.push({ ok, name, detail });
  if (!ok) {
    failures.push({ name, detail });
  }
}

await main();

async function main() {
  await runCheckGroup("review_prepare_cards empty explanation", verifyReviewPrepareEmptyExplanation);
  await runCheckGroup("review_commit_decisions alias and capture unwrap", verifyCommitAliasAndCaptureUnwrap);
  await runCheckGroup("briefing_generate schema error", verifyBriefingSchemaError);
  await runCheckGroup("tool contract guidance", verifyToolContractGuidance);
  await runCheckGroup("Chinese model prompt guidance", verifyChineseModelPromptGuidance);

  if (failures.length) {
    console.error(JSON.stringify({ status: "failed", checks, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "passed", checks }, null, 2));
}

async function runCheckGroup(name, fn) {
  try {
    await fn();
  } catch (error) {
    record(false, `${name} does not throw unexpectedly`, String(error?.stack || error?.message || error));
  }
}

function verifyReviewPrepareEmptyExplanation() {
  const result = runHostModelTool({
    tool_name: "review_prepare_cards",
    tool_input: {
      ingestion_result: {
        skill: "relationship-ingestion",
        stage: "ingestion",
        status: "success",
        detected_people: [
          {
            person_name: "Cheng Bing",
            confidence: "high",
            evidence: ["Cheng Bing owns budget review."]
          }
        ],
        resolved_people: [
          {
            person_name: "Cheng Bing",
            resolution_action: "update",
            confidence: "high"
          }
        ],
        review_bundle: {
          candidates: []
        }
      }
    }
  });

  record(result.status === "no_review_required", "empty profile review returns no-review status", JSON.stringify(result));
  record(Boolean(result.explanation), "empty profile review explains why there are no cards", JSON.stringify(result));
  record(Array.isArray(result.candidates_preview) && result.candidates_preview.length === 1, "empty profile review includes candidates preview", JSON.stringify(result));
}

async function verifyCommitAliasAndCaptureUnwrap() {
  const captureResult = await runHostModelTool({
    tool_name: "capture_ingest_sources",
    tool_input: {
      sources: [
        {
          source_id: "catpaw-meeting-001",
          source_type: "markdown",
          title: "CatPaw host meeting",
          content: "Cheng Bing owns budget review and needs a clear model evaluation baseline."
        }
      ],
      host_model: {
        provider: "catpaw-host",
        model: "glm-host",
        target: "catpaw"
      },
      host_reasoning_output: {
        status: "success",
        source_summary: {
          source_count: 1,
          excerpt_count: 1,
          dropped_excerpt_count: 0,
          target_people: ["Cheng Bing"],
          focus_people: ["Cheng Bing"]
        },
        detected_people: [
          {
            person_name: "Cheng Bing",
            confidence: "high",
            matched_source_ids: ["catpaw-meeting-001"],
            evidence: ["Cheng Bing owns budget review and needs a clear model evaluation baseline."]
          }
        ],
        resolved_people: [
          {
            person_name: "Cheng Bing",
            resolution_action: "create",
            reasoning: "New high-confidence relationship person from CatPaw test material.",
            confidence: "high"
          }
        ],
        person_profiles: [
          {
            person_name: "Cheng Bing",
            person_ref: "person_cheng_bing",
            profile_tier: "active",
            confidence: "high",
            tags: ["budget", "model-evaluation"],
            compiled_truth: {
              summary: "Owns budget review and cares about model evaluation baselines.",
              latent_needs: {
                counterpart_needs: ["Clear evaluation criteria before budget commitment"],
                self_needs: [],
                evidence: ["needs a clear model evaluation baseline"],
                confidence: "high"
              }
            },
            timeline: [
              {
                date: "2026-04-26",
                event_summary: "Discussed budget review and model evaluation baseline.",
                source_id: "catpaw-meeting-001",
                source_title: "CatPaw host meeting"
              }
            ]
          }
        ],
        review_bundle: {
          candidates: []
        }
      },
      options: {
        auto_context_from_store: false
      }
    }
  });

  const result = runHostModelTool({
    tool_name: "review_commit_decisions",
    tool_input: {
      target: "profile_review",
      commit_request: {
        ingestion_result: captureResult,
        decisions: [
          {
            person_name: "Cheng Bing",
            final_action: "create",
            resolved_person_ref: "person_cheng_bing",
            resolved_person_name: "Cheng Bing",
            profile_tier: "active",
            notes: "CatPaw alias compatibility smoke."
          }
        ],
        profile_store_path: path.join(tempRoot, "relationship-profile-store.json"),
        operator: "catpaw-smoke"
      }
    }
  });

  record(result.status === "success", "review_commit_decisions accepts decisions alias and capture response", JSON.stringify(result));
  record(result.profile_store_delta?.written === true, "commit writes profile store through canonical path", JSON.stringify(result.profile_store_delta || null));
}

async function verifyBriefingSchemaError() {
  let message = "";
  try {
    await runHostModelTool({
      tool_name: "briefing_generate",
      tool_input: {
        conversation_goal: "Prepare for a budget review conversation.",
        target_profile: {
          person_name: "Cheng Bing",
          compiled_truth: {
            summary: "Owns budget review."
          }
        },
        host_reasoning_output: {
          quick_brief: "Discuss budget review."
        }
      }
    });
  } catch (error) {
    message = String(error?.message || error);
  }

  record(message.includes("missing required briefing fields"), "briefing schema error names missing fields", message);
  record(message.includes("relationship_read") && message.includes("next_actions"), "briefing schema error lists expected fields", message);
}

function verifyToolContractGuidance() {
  const commitTool = getHostModelToolDefinition("review_commit_decisions");
  const briefingTool = getHostModelToolDefinition("briefing_generate");
  const prepareTool = getHostModelToolDefinition("review_prepare_cards");
  const captureTool = getHostModelToolDefinition("capture_ingest_sources");

  record(commitTool?.input_contract?.aliases?.decisions === "commit_request.review_decisions", "commit contract documents decisions alias", JSON.stringify(commitTool?.input_contract || null));
  record(Array.isArray(commitTool?.input_contract?.nested?.commit_request?.profile_review?.required), "commit contract documents nested profile fields", JSON.stringify(commitTool?.input_contract?.nested || null));
  record(Array.isArray(briefingTool?.input_contract?.host_reasoning_output_schema?.required), "briefing contract documents host reasoning schema", JSON.stringify(briefingTool?.input_contract || null));
  record(briefingTool.input_contract.host_reasoning_output_schema.required.includes("quick_brief"), "briefing schema includes quick_brief", JSON.stringify(briefingTool.input_contract.host_reasoning_output_schema));
  record(prepareTool?.output_contract?.primary_fields?.includes("candidates_preview"), "review prepare contract includes candidates_preview", JSON.stringify(prepareTool?.output_contract || null));
  record(captureTool?.output_contract?.canonical_result_field === "ingestion_result", "capture contract points to canonical nested ingestion result", JSON.stringify(captureTool?.output_contract || null));
}

function verifyChineseModelPromptGuidance() {
  const render = spawnSync(process.execPath, [renderPromptPacketScript, "--host", "openclaw"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  record(render.status === 0, "OpenClaw prompt renders for CatPaw-style host", render.stderr || "");
  const output = render.stdout || "";
  record(output.includes("Chinese-model extraction guardrails"), "OpenClaw prompt includes Chinese model guardrails", "");
  record(output.includes("copy Chinese names exactly"), "OpenClaw prompt warns against homophone replacement", "");
  record(output.includes("weak_evidence"), "OpenClaw prompt tells weak models to mark weak evidence", "");
  record(output.includes("commit-decisions.request.example.json"), "OpenClaw prompt references commit-decisions sample", "");
}
