// SPDX-License-Identifier: Apache-2.0
import { runCoStarCommit } from "../commit/costar-commit.mjs";
import { runRelationshipProfile } from "../../relationship-profile/runtime/relationship-profile.mjs";
import { runRelationshipGraph } from "../../relationship-graph/runtime/relationship-graph.mjs";
import { runRelationshipView } from "../../relationship-view/runtime/relationship-view.mjs";
import { runHostModelCaptureWorkflow } from "../host-model-workflows/capture-workflow.mjs";
import { runHostModelBriefingWorkflow } from "../host-model-workflows/briefing-workflow.mjs";
import { runHostModelRoleplayWorkflow } from "../host-model-workflows/roleplay-workflow.mjs";
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
      ignored_noise_count: resolvedPeople.filter((item) => item?.resolution_action === "ignore").length
    },
    confirmation_request: {
      required: reviewCandidates.length > 0,
      pending_count: reviewCandidates.length,
      top_candidates: reviewCandidates.slice(0, 3)
    }
  };
}

function pickLimitOption(toolInput) {
  if (toolInput?.limit == null) {
    return {};
  }
  return { limit: toolInput.limit };
}
