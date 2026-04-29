// SPDX-License-Identifier: Apache-2.0
import { buildCaptureResponseArtifact } from "../artifacts/capture-artifacts.mjs";
import { __capture_internal, getRelationshipCaptureSkillInfo } from "../../relationship-capture/runtime/relationship-capture.mjs";

export async function runHostModelCaptureWorkflow(payload) {
  const request = __capture_internal.validateCaptureRequest(payload);
  const autoContext = request.ingestion_result ? null : __capture_internal.deriveAutoContext(request);
  const effectiveExistingPeople = autoContext ? autoContext.existing_people : request.existing_people;
  const ingestionResult = request.ingestion_result
    ? attachSourceManifest(request.ingestion_result, request)
    : normalizeCaptureReasoning(payload.host_reasoning_output, request);

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

  const insightPreview = buildIngestionInsightPreview(ingestionResult);
  response.processing_feedback.insight_preview = insightPreview;
  response.user_feedback.insight_preview = insightPreview;
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

function normalizeCaptureReasoning(reasoningOutput, request = {}) {
  if (!reasoningOutput || typeof reasoningOutput !== "object" || Array.isArray(reasoningOutput)) {
    throw new Error("capture_ingest_sources requires host_reasoning_output as a JSON object.");
  }

  const candidate = reasoningOutput.ingestion_result && typeof reasoningOutput.ingestion_result === "object"
    ? reasoningOutput.ingestion_result
    : reasoningOutput;

  if (!Array.isArray(candidate.resolved_people) && !Array.isArray(candidate.person_profiles)) {
    throw new Error("host_reasoning_output is missing the expected ingestion_result structure.");
  }

  return attachSourceManifest({
    skill: normalizeString(candidate.skill) || "relationship-ingestion",
    version: normalizeString(candidate.version) || "0.1.0",
    status: normalizeString(candidate.status) || "success",
    source: normalizeString(candidate.source) || "host_model",
    source_label: normalizeString(candidate.source_label) || "Host-model extraction",
    ...candidate
  }, request);
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

function attachSourceManifest(ingestionResult, request) {
  const existingManifest = normalizeSourceManifest(ingestionResult?.source_manifest);
  const requestManifest = normalizeSourceManifest(request?.sources);
  const sourceManifest = mergeSourceManifest(existingManifest, requestManifest);
  if (!sourceManifest.length) {
    return ingestionResult;
  }

  return {
    ...ingestionResult,
    source_manifest: sourceManifest
  };
}

function normalizeSourceManifest(sources) {
  if (!Array.isArray(sources)) {
    return [];
  }
  return sources
    .map((source, index) => normalizeSourceItem(source, index))
    .filter(Boolean);
}

function normalizeSourceItem(source, index) {
  if (!source || typeof source !== "object") {
    return null;
  }
  const sourceId = normalizeString(source.source_id || source.id) || `source-${index + 1}`;
  const sourceTitle = normalizeString(source.source_title || source.title || source.name)
    || "Direct communication input";
  return {
    source_id: sourceId,
    source_title: sourceTitle,
    relative_path: normalizeString(source.relative_path || source.path || source.file_path),
    captured_at: normalizeString(source.captured_at || source.date || source.created_at || source.updated_at),
    source_type: normalizeString(source.source_type || source.type)
  };
}

function mergeSourceManifest(left, right) {
  const merged = new Map();
  [...left, ...right].forEach((source) => {
    const key = source.source_id;
    const existing = merged.get(key);
    merged.set(key, existing ? { ...source, ...existing } : source);
  });
  return Array.from(merged.values());
}

function buildIngestionInsightPreview(ingestionResult) {
  const profiles = Array.isArray(ingestionResult?.person_profiles) ? ingestionResult.person_profiles : [];
  const candidates = Array.isArray(ingestionResult?.review_bundle?.candidates)
    ? ingestionResult.review_bundle.candidates
    : [];
  return [...profiles, ...candidates]
    .slice(0, 5)
    .map((item) => ({
      person_name: normalizeString(item.person_name),
      latent_needs: item.compiled_truth?.latent_needs || getCandidateField(item, "compiled_truth.latent_needs") || null,
      key_issues: item.compiled_truth?.key_issues || getCandidateField(item, "compiled_truth.key_issues") || null,
      attitude_intent: item.compiled_truth?.attitude_intent || getCandidateField(item, "compiled_truth.attitude_intent") || null
    }))
    .filter((item) => item.person_name);
}

function getCandidateField(candidate, fieldName) {
  const fields = Array.isArray(candidate?.fields_to_confirm) ? candidate.fields_to_confirm : [];
  return fields.find((field) => normalizeString(field?.field) === fieldName)?.current_value;
}
