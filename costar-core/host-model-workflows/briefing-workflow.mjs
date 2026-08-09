// SPDX-License-Identifier: Apache-2.0
import { __briefing_internal, getRelationshipBriefingSkillInfo } from "../../relationship-briefing/runtime/relationship-briefing.mjs";
import { recordBriefingArtifact, searchFactsForBriefing } from "../memory/memory-retrieval.mjs";

const REQUIRED_BRIEFING_FIELDS = [
  "quick_brief",
  "relationship_read",
  "approach_strategy",
  "talking_points",
  "watchouts",
  "questions_to_ask",
  "next_actions"
];

export async function runHostModelBriefingWorkflow(payload) {
  const request = __briefing_internal.validateBriefingRequest(payload);
  const profile = __briefing_internal.resolveTargetProfile(request);
  const context = __briefing_internal.deriveBriefingContext(request, profile);
  const memoryStorePath = normalizeString(payload.memory_store_path || payload.store_path);
  const memoryHits = await searchFactsForBriefing({
    storePath: memoryStorePath,
    personName: profile.person_name || request.person_name,
    personRef: profile.person_ref || request.person_ref,
    conversationGoal: request.conversation_goal
  });
  const parsed = normalizeBriefingReasoning(payload.host_reasoning_output);
  const model = buildHostModelDescriptor(payload.host_model, "briefing");
  const result = __briefing_internal.normalizeBriefingOutput({
    parsed,
    request,
    profile,
    context,
    config: model,
    source: "host_model_adapter"
  });

  const briefingFile = request.options.write_briefing_file
    ? __briefing_internal.writeBriefingMarkdown({ request, result, profile, context })
    : {
        written: false,
        path: "",
        title: "",
        slug: ""
      };

  const memoryEvidence = buildMemoryEvidence({ memoryStorePath, memoryHits, briefingFile });
  const response = {
    ...result,
    briefing_file: briefingFile,
    facts_included: memoryEvidence.facts_included,
    memory_evidence: memoryEvidence,
    host_model: summarizeHostModel(payload.host_model),
    run_directory: null
  };

  if (request.options.save_run_artifacts) {
    response.run_directory = __briefing_internal.persistRunArtifacts({
      request,
      response,
      raw: {
        host_model: payload.host_model || null,
        host_reasoning_output: payload.host_reasoning_output || null
      }
    });
  }

  return response;
}

export function getHostModelBriefingWorkflowInfo() {
  return {
    layer: "costar-host-model-briefing-workflow",
    version: "0.1.0",
    skill_info: getRelationshipBriefingSkillInfo()
  };
}

function normalizeBriefingReasoning(reasoningOutput) {
  if (!reasoningOutput || typeof reasoningOutput !== "object" || Array.isArray(reasoningOutput)) {
    throw new Error("briefing_generate requires host_reasoning_output as a JSON object.");
  }

  if (reasoningOutput.briefing && typeof reasoningOutput.briefing === "object") {
    assertCompleteBriefing(reasoningOutput.briefing);
    return reasoningOutput;
  }

  const containsTopLevelBriefing = REQUIRED_BRIEFING_FIELDS.some((key) => key in reasoningOutput);
  if (!containsTopLevelBriefing) {
    throwBriefingSchemaError(REQUIRED_BRIEFING_FIELDS);
  }
  assertCompleteBriefing(reasoningOutput);

  const { open_questions, notes, ...briefing } = reasoningOutput;
  return {
    briefing,
    open_questions,
    notes
  };
}

function assertCompleteBriefing(briefing) {
  const missing = REQUIRED_BRIEFING_FIELDS.filter((field) => !hasMeaningfulValue(briefing?.[field]));
  if (missing.length) {
    throwBriefingSchemaError(missing);
  }
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return normalizeString(value).length > 0;
}

function throwBriefingSchemaError(missingFields) {
  throw new Error(
    `host_reasoning_output is missing required briefing fields: ${missingFields.join(", ")}. ` +
      `Expected host_reasoning_output.briefing or top-level fields: ${REQUIRED_BRIEFING_FIELDS.join(", ")}.`
  );
}

function buildHostModelDescriptor(hostModel, fallbackName) {
  const provider = normalizeString(hostModel?.provider) || "host-model";
  const model = normalizeString(hostModel?.model || hostModel?.name) || `${fallbackName}-host-model`;
  const target = normalizeString(hostModel?.target || hostModel?.host || hostModel?.adapter) || provider;
  const temperature = hostModel?.temperature ?? null;
  return {
    provider,
    base_url: `host://${slugify(target || provider)}`,
    model,
    temperature
  };
}

function summarizeHostModel(hostModel) {
  return {
    provider: normalizeString(hostModel?.provider) || "host-model",
    model: normalizeString(hostModel?.model || hostModel?.name) || "",
    target: normalizeString(hostModel?.target || hostModel?.host || hostModel?.adapter) || "",
    reasoning_mode: "host_supplied"
  };
}

function buildMemoryEvidence({ memoryStorePath, memoryHits, briefingFile }) {
  const factsIncluded = Array.isArray(memoryHits?.facts_included) ? memoryHits.facts_included : [];
  const targetEntity = memoryHits?.target_entity || null;
  const evidence = {
    target_entity: targetEntity,
    facts_included: factsIncluded,
    evidence_trace_available: factsIncluded.length > 0,
    artifact_ref: null
  };

  if (!memoryStorePath || !targetEntity) {
    return evidence;
  }

  const artifactResult = recordBriefingArtifact({
    storePath: memoryStorePath,
    targetEntities: [targetEntity.entity_id],
    factsIncluded,
    artifactPath: briefingFile?.path || ""
  });
  return {
    ...evidence,
    artifact_ref: artifactResult.artifact
  };
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function slugify(value) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "host";
}
