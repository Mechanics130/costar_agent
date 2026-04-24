// SPDX-License-Identifier: Apache-2.0
import { buildCaptureResponseArtifact } from "../artifacts/capture-artifacts.mjs";
import { __capture_internal, getRelationshipCaptureSkillInfo } from "../../relationship-capture/runtime/relationship-capture.mjs";

export async function runHostModelCaptureWorkflow(payload) {
  const request = __capture_internal.validateCaptureRequest(payload);
  const autoContext = request.ingestion_result ? null : __capture_internal.deriveAutoContext(request);
  const effectiveExistingPeople = autoContext ? autoContext.existing_people : request.existing_people;
  const ingestionResult = request.ingestion_result || normalizeCaptureReasoning(payload.host_reasoning_output);

  const processingFeedback = __capture_internal.buildProcessingFeedbackFromIngestion(ingestionResult);
  const confirmationRequest = __capture_internal.buildConfirmationRequestFromIngestion(ingestionResult);

  const response = buildCaptureResponseArtifact({
    skill: "relationship-capture",
    version: "0.1.0",
    status: confirmationRequest.required ? "needs_review" : ingestionResult.status || "success",
    stage: "ingestion",
    receipt: __capture_internal.buildIngestionReceipt(request, ingestionResult, autoContext, effectiveExistingPeople),
    processingFeedback,
    confirmationRequest,
    nextAction: __capture_internal.buildNextActionForIngestion(confirmationRequest, processingFeedback),
    userFeedback: __capture_internal.buildUserFeedbackForIngestion(processingFeedback, confirmationRequest, autoContext),
    ingestionResult,
    reviewResolutionResult: null,
    viewRefreshResult: null,
    commitFeedback: null,
    notes: request.notes || ""
  });

  response.host_model = summarizeHostModel(payload.host_model);
  response.source = "host_model_adapter";
  return response;
}

export function getHostModelCaptureWorkflowInfo() {
  return {
    layer: "costar-host-model-capture-workflow",
    version: "0.1.0",
    skill_info: getRelationshipCaptureSkillInfo()
  };
}

function normalizeCaptureReasoning(reasoningOutput) {
  if (!reasoningOutput || typeof reasoningOutput !== "object" || Array.isArray(reasoningOutput)) {
    throw new Error("capture_ingest_sources requires host_reasoning_output as a JSON object.");
  }

  const candidate = reasoningOutput.ingestion_result && typeof reasoningOutput.ingestion_result === "object"
    ? reasoningOutput.ingestion_result
    : reasoningOutput;

  if (!Array.isArray(candidate.resolved_people) && !Array.isArray(candidate.person_profiles)) {
    throw new Error("host_reasoning_output is missing the expected ingestion_result structure.");
  }

  return {
    skill: normalizeString(candidate.skill) || "relationship-ingestion",
    version: normalizeString(candidate.version) || "0.1.0",
    status: normalizeString(candidate.status) || "success",
    source: normalizeString(candidate.source) || "host_model",
    source_label: normalizeString(candidate.source_label) || "Host-model extraction",
    ...candidate
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
