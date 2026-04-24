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

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function buildProfileReviewSummaryArtifact({
  decisionCount = 0,
  committedCount = 0,
  createdCount = 0,
  updatedCount = 0,
  ignoredCount = 0,
  deferredCount = 0,
  unresolvedCount = 0,
  autoCommittedCount = 0
} = {}) {
  return {
    decision_count: toCount(decisionCount),
    committed_count: toCount(committedCount),
    created_count: toCount(createdCount),
    updated_count: toCount(updatedCount),
    ignored_count: toCount(ignoredCount),
    deferred_count: toCount(deferredCount),
    unresolved_count: toCount(unresolvedCount),
    auto_committed_count: toCount(autoCommittedCount)
  };
}

export function buildProfileStoreDeltaArtifact({
  upserts = [],
  ignoredPeople = [],
  deferredPeople = [],
  autoCommittedPeople = [],
  storeWrite = {}
} = {}) {
  const normalizedWrite = toObject(storeWrite);
  return {
    upserts: toArray(upserts),
    ignored_people: toArray(ignoredPeople),
    deferred_people: toArray(deferredPeople),
    auto_committed_people: toArray(autoCommittedPeople),
    store_path: toStringValue(normalizedWrite.store_path),
    written: Boolean(normalizedWrite.written),
    total_profiles_after_write: toCount(
      normalizedWrite.total_profiles_after_write ?? normalizedWrite.profile_count
    )
  };
}

export function buildGraphReviewSummaryArtifact({
  decisionCount = 0,
  confirmedCount = 0,
  rejectedCount = 0,
  downgradedCount = 0,
  reclassifiedCount = 0,
  deferredCount = 0,
  unresolvedCount = 0
} = {}) {
  return {
    decision_count: toCount(decisionCount),
    confirmed_count: toCount(confirmedCount),
    rejected_count: toCount(rejectedCount),
    downgraded_count: toCount(downgradedCount),
    reclassified_count: toCount(reclassifiedCount),
    deferred_count: toCount(deferredCount),
    unresolved_count: toCount(unresolvedCount)
  };
}

export function buildGraphReviewStoreDeltaArtifact({
  upserts = [],
  storeWrite = {}
} = {}) {
  const normalizedWrite = toObject(storeWrite);
  return {
    upserts: toArray(upserts),
    store_path: toStringValue(normalizedWrite.store_path),
    written: Boolean(normalizedWrite.written),
    total_decisions_after_write: toCount(normalizedWrite.total_decisions_after_write)
  };
}

export function buildCommitFeedbackArtifact({
  headline = "",
  summaryLines = [],
  nextAction = null
} = {}) {
  return {
    headline: toStringValue(headline),
    summary_lines: toArray(summaryLines).map((line) => toStringValue(line)).filter(Boolean),
    next_action: nextAction && typeof nextAction === "object" ? nextAction : null
  };
}
