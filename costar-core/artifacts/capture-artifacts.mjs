// SPDX-License-Identifier: Apache-2.0

function toCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toStringValue(value) {
  return String(value ?? "").trim();
}

export function buildViewRefreshResultArtifact({
  attempted = false,
  refreshedCount = 0,
  reason = "",
  refreshedViews = [],
  viewStorePath = "",
  markdownDir = "",
  result = null
} = {}) {
  return {
    attempted: Boolean(attempted),
    refreshed_count: toCount(refreshedCount),
    reason: toStringValue(reason),
    refreshed_views: toArray(refreshedViews),
    view_store_path: toStringValue(viewStorePath),
    markdown_dir: toStringValue(markdownDir),
    result: result && typeof result === "object" ? result : null
  };
}

export function buildCaptureResponseArtifact({
  skill,
  version,
  status,
  stage,
  receipt,
  processingFeedback,
  confirmationRequest,
  nextAction,
  userFeedback,
  ingestionResult = null,
  reviewResolutionResult = null,
  viewRefreshResult = null,
  commitFeedback = null,
  notes = ""
} = {}) {
  return {
    skill: toStringValue(skill),
    version: toStringValue(version),
    status: toStringValue(status) || "success",
    stage: toStringValue(stage),
    receipt: receipt && typeof receipt === "object" ? receipt : {},
    processing_feedback: processingFeedback && typeof processingFeedback === "object" ? processingFeedback : {},
    confirmation_request: confirmationRequest && typeof confirmationRequest === "object" ? confirmationRequest : {},
    next_action: nextAction && typeof nextAction === "object" ? nextAction : null,
    user_feedback: userFeedback && typeof userFeedback === "object" ? userFeedback : {},
    ingestion_result: ingestionResult && typeof ingestionResult === "object" ? ingestionResult : null,
    review_resolution_result: reviewResolutionResult && typeof reviewResolutionResult === "object"
      ? reviewResolutionResult
      : null,
    view_refresh_result: viewRefreshResult && typeof viewRefreshResult === "object"
      ? viewRefreshResult
      : null,
    commit_feedback: commitFeedback && typeof commitFeedback === "object" ? commitFeedback : null,
    notes: toStringValue(notes)
  };
}
