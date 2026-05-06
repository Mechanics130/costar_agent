// SPDX-License-Identifier: Apache-2.0
import { runCoStarCommit } from "../commit/costar-commit.mjs";
import { runRelationshipProfile } from "../../relationship-profile/runtime/relationship-profile.mjs";
import { runRelationshipGraph } from "../../relationship-graph/runtime/relationship-graph.mjs";
import { runRelationshipView } from "../../relationship-view/runtime/relationship-view.mjs";
import { runHostModelCaptureWorkflow } from "../host-model-workflows/capture-workflow.mjs";
import { runHostModelBriefingWorkflow } from "../host-model-workflows/briefing-workflow.mjs";
import { runHostModelRoleplayWorkflow } from "../host-model-workflows/roleplay-workflow.mjs";
import {
  buildMemoryReflectionCards,
  commitMemoryReflectionDecisions,
  getMemoryFeedbackReport,
  getMemoryHints,
  recordMemoryFeedback
} from "../memory/memory-feedback.mjs";
import { runMemoryLint } from "../memory/memory-lint.mjs";
import { buildMemoryReviewCards, translateMemoryReviewAnswers } from "../memory/memory-review.mjs";
import { buildHostReviewPrompt, translateHostReviewAnswers } from "../host-model-adapter/review-protocol.mjs";
import {
  getHostModelToolDefinition,
  listHostModelTools
} from "./tool-contract.mjs";

export function getHostModelDispatcherInfo() {
  return {
    layer: "costar-host-model-dispatcher",
    version: "0.1.0",
    supported_tools: listHostModelTools()
  };
}

export function runHostModelTool(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("host-model tool payload must be a JSON object.");
  }

  const toolName = String(payload.tool_name ?? "").trim();
  const toolInput = payload.tool_input && typeof payload.tool_input === "object" && !Array.isArray(payload.tool_input)
    ? payload.tool_input
    : {};
  const definition = getHostModelToolDefinition(toolName);
  if (!definition) {
    throw new Error(`Unknown host-model tool: ${toolName}`);
  }

  if (definition.requires_host_reasoning) {
    if (toolInput.host_reasoning_output && typeof toolInput.host_reasoning_output === "object") {
      return runHostReasoningTool({ toolName, toolInput });
    }
    return {
      status: "host_reasoning_required",
      tool_name: definition.name,
      tool_definition: definition,
      message: "This tool contract is defined, but reasoning must be supplied by the host model adapter."
    };
  }

  switch (toolName) {
    case "review_commit_decisions":
      return runCoStarCommit(toolInput);
    case "review_prepare_cards":
      return buildReviewPromptCards(toolInput);
    case "review_translate_answers":
      return buildReviewCommitPayload(toolInput);
    case "memory_review_prepare_cards":
      return buildMemoryReviewCards(toolInput);
    case "memory_review_translate_answers":
      return buildMemoryCommitPayload(toolInput);
    case "memory_commit_decisions":
      return runCoStarCommit({
        target: "memory_review",
        commit_id: normalizeString(toolInput.commit_id),
        commit_log_path: normalizeString(toolInput.commit_log_path),
        commit_request: normalizeObject(toolInput.commit_request) || toolInput
      });
    case "memory_feedback_record":
      return recordMemoryFeedback(toolInput);
    case "memory_reflection_prepare_cards":
      return buildMemoryReflectionCards(toolInput);
    case "memory_reflection_commit":
      return commitMemoryReflectionDecisions(toolInput);
    case "memory_hints_get":
      return getMemoryHints(toolInput);
    case "memory_feedback_report":
      return getMemoryFeedbackReport(toolInput);
    case "memory_lint":
      return runMemoryLint(toolInput);
    case "profile_get":
      return runRelationshipProfile({
        mode: "get_profile",
        ...toolInput
      });
    case "profile_search":
      return runRelationshipProfile({
        mode: "search_profiles",
        ...toolInput
      });
    case "graph_get_person":
      return runRelationshipGraph({
        mode: "get_person_graph",
        ...toolInput
      });
    case "graph_find_path":
      return runRelationshipGraph({
        mode: "find_connection_path",
        ...toolInput
      });
    case "view_get":
      return runRelationshipView({
        mode: "get_person_view",
        ...toolInput
      });
    case "view_refresh":
      return runRelationshipView({
        mode: toolInput.people ? "refresh_people_views" : "refresh_person_view",
        ...toolInput
      });
    case "review_list_candidates":
      return buildReviewCandidateList(toolInput);
    case "capture_get_feedback":
      return buildCaptureFeedbackPreview(toolInput);
    default:
      throw new Error(`Tool ${toolName} is defined but not yet dispatcher-backed.`);
  }
}

function runHostReasoningTool({ toolName, toolInput }) {
  switch (toolName) {
    case "capture_ingest_sources":
      return runHostModelCaptureWorkflow(toolInput);
    case "briefing_generate":
      return runHostModelBriefingWorkflow(toolInput);
    case "roleplay_generate":
      return runHostModelRoleplayWorkflow(toolInput);
    default:
      return {
        status: "host_reasoning_required",
        tool_name: toolName,
        message: "This host-reasoning tool is not materialized yet. Supply reasoning later after the workflow is implemented."
      };
  }
}

function buildReviewCandidateList(toolInput) {
  const ingestionCandidates = Array.isArray(toolInput?.ingestion_result?.review_bundle?.candidates)
    ? toolInput.ingestion_result.review_bundle.candidates
    : [];
  const graphCandidates = Array.isArray(toolInput?.graph_result?.review_bundle?.edge_candidates)
    ? toolInput.graph_result.review_bundle.edge_candidates
    : [];

  if (ingestionCandidates.length) {
    return {
      status: "success",
      review_type: "profile_review",
      pending_count: ingestionCandidates.length,
      review_candidates: ingestionCandidates
    };
  }

  if (graphCandidates.length) {
    return {
      status: "success",
      review_type: "graph_review",
      pending_count: graphCandidates.length,
      review_candidates: graphCandidates
    };
  }

  return {
    status: "success",
    review_type: "none",
    pending_count: 0,
    review_candidates: []
  };
}

function buildReviewPromptCards(toolInput) {
  if (toolInput?.ingestion_result && typeof toolInput.ingestion_result === "object") {
    return buildHostReviewPrompt(
      {
        ...toolInput.ingestion_result,
        stage: toolInput.ingestion_result.stage || "ingestion"
      },
      toolInput.options || pickLimitOption(toolInput)
    );
  }

  if (toolInput?.graph_result && typeof toolInput.graph_result === "object") {
    return buildHostReviewPrompt(toolInput.graph_result, toolInput.options || pickLimitOption(toolInput));
  }

  throw new Error("review_prepare_cards requires ingestion_result or graph_result.");
}

function buildReviewCommitPayload(toolInput) {
  return translateHostReviewAnswers(toolInput);
}

function buildMemoryCommitPayload(toolInput) {
  return {
    target: "memory_review",
    commit_id: normalizeString(toolInput.commit_id),
    commit_log_path: normalizeString(toolInput.commit_log_path),
    commit_request: {
      memory_store_path: normalizeString(toolInput.memory_store_path || toolInput.store_path),
      source_refs: Array.isArray(toolInput.source_refs) ? toolInput.source_refs : [],
      candidates: Array.isArray(toolInput.candidates) ? toolInput.candidates : [],
      review_decisions: translateMemoryReviewAnswers(toolInput),
      operator: normalizeString(toolInput.operator),
      notes: normalizeString(toolInput.notes),
      options: normalizeObject(toolInput.options) || {}
    }
  };
}

function buildCaptureFeedbackPreview(toolInput) {
  const ingestionResult = toolInput?.ingestion_result;
  if (!ingestionResult || typeof ingestionResult !== "object") {
    throw new Error("capture_get_feedback requires ingestion_result.");
  }

  const reviewCandidates = Array.isArray(ingestionResult?.review_bundle?.candidates)
    ? ingestionResult.review_bundle.candidates
    : [];
  const resolvedPeople = Array.isArray(ingestionResult?.resolved_people)
    ? ingestionResult.resolved_people
    : [];

  return {
    status: "success",
    receipt: {
      pending_review_count: reviewCandidates.length,
      resolved_people_count: resolvedPeople.length
    },
    processing_feedback: {
      updated_people_count: resolvedPeople.filter((item) => item?.resolution_action === "update").length,
      new_candidate_count: resolvedPeople.filter((item) => item?.resolution_action === "create").length,
      ignored_noise_count: resolvedPeople.filter((item) => item?.resolution_action === "ignore").length,
      insight_preview: buildIngestionInsightPreview(ingestionResult)
    },
    confirmation_request: {
      required: reviewCandidates.length > 0,
      pending_count: reviewCandidates.length,
      top_candidates: reviewCandidates.slice(0, 3)
    }
  };
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

function pickLimitOption(toolInput) {
  if (toolInput?.limit == null) {
    return {};
  }
  return { limit: toolInput.limit };
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
