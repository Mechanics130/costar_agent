// SPDX-License-Identifier: Apache-2.0
import { __roleplay_internal, getRelationshipRoleplaySkillInfo } from "../../relationship-roleplay/runtime/relationship-roleplay.mjs";

export async function runHostModelRoleplayWorkflow(payload) {
  const request = __roleplay_internal.validateRoleplayRequest(payload);
  const profile = __roleplay_internal.resolveTargetProfile(request);
  const parsed = normalizeRoleplayReasoning(payload.host_reasoning_output);
  const model = buildHostModelDescriptor(payload.host_model, "roleplay");
  const result = __roleplay_internal.normalizeRoleplayOutput({
    parsed,
    request,
    profile,
    config: model,
    source: "host_model_adapter"
  });

  const response = {
    ...result,
    host_model: summarizeHostModel(payload.host_model),
    run_directory: null
  };

  if (request.options.save_run_artifacts) {
    response.run_directory = __roleplay_internal.persistRunArtifacts({
      request,
      result: response,
      raw: {
        host_model: payload.host_model || null,
        host_reasoning_output: payload.host_reasoning_output || null
      }
    });
  }

  return response;
}

export function getHostModelRoleplayWorkflowInfo() {
  return {
    layer: "costar-host-model-roleplay-workflow",
    version: "0.1.0",
    skill_info: getRelationshipRoleplaySkillInfo()
  };
}

function normalizeRoleplayReasoning(reasoningOutput) {
  if (!reasoningOutput || typeof reasoningOutput !== "object" || Array.isArray(reasoningOutput)) {
    throw new Error("roleplay_generate requires host_reasoning_output as a JSON object.");
  }

  if (reasoningOutput.simulation && typeof reasoningOutput.simulation === "object") {
    return reasoningOutput;
  }

  const topLevelSimulationFields = [
    "persona_read",
    "opening_assessment",
    "simulated_turns",
    "likely_pushbacks",
    "recommended_replies",
    "danger_zones",
    "if_conversation_goes_well"
  ];
  const containsTopLevelSimulation = topLevelSimulationFields.some((key) => key in reasoningOutput);
  if (!containsTopLevelSimulation) {
    throw new Error("host_reasoning_output is missing the expected roleplay structure.");
  }

  const { coach_feedback, open_questions, notes, ...simulation } = reasoningOutput;
  return {
    simulation,
    coach_feedback,
    open_questions,
    notes
  };
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
