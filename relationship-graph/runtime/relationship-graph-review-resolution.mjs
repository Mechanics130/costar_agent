// SPDX-License-Identifier: Apache-2.0
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRelationshipGraphSkillInfo } from "./relationship-graph.mjs";
import {
  buildCommitFeedbackArtifact,
  buildGraphReviewStoreDeltaArtifact,
  buildGraphReviewSummaryArtifact
} from "../../costar-core/artifacts/review-artifacts.mjs";
import {
  loadGraphReviewStore as loadGraphReviewStoreState,
  writeGraphReviewStore as writeGraphReviewStoreState
} from "../../costar-core/stores/graph-review-store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const { default_review_store_path: defaultReviewStorePath } = getRelationshipGraphSkillInfo();

const SKILL_NAME = "relationship-graph-review-resolution";
const SKILL_VERSION = "0.1.0";
const DEFAULT_OPTIONS = {
  write_store: true
};

export function getRelationshipGraphReviewResolutionSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    default_review_store_path: defaultReviewStorePath
  };
}

export function runRelationshipGraphReviewResolution(payload) {
  const request = validateGraphReviewResolutionRequest(payload);
  const processedAt = new Date().toISOString();
  const storePath = request.graph_review_store_path || defaultReviewStorePath;
  const reviewStore = loadGraphReviewStore(storePath);
  const candidateMap = buildCandidateMap(request.graph_result);
  const results = {
    confirmedEdges: [],
    rejectedEdges: [],
    downgradedEdges: [],
    reclassifiedEdges: [],
    deferredEdges: [],
    unresolvedCandidates: [],
    upserts: []
  };

  const decisionMap = buildDecisionMap(request.review_decisions);

  for (const candidate of candidateMap.values()) {
    const decision = decisionMap.get(candidate.edge_key);
    if (!decision) {
      results.unresolvedCandidates.push(buildUnresolvedCandidate(candidate));
      continue;
    }

    const record = finalizeDecisionRecord({
      candidate,
      decision,
      processedAt,
      operator: request.operator
    });

    if (record.final_action === "defer") {
      results.deferredEdges.push(buildCommittedEdgeRecord(record));
      continue;
    }

    results.upserts.push(record);
    if (record.final_action === "confirm") {
      results.confirmedEdges.push(buildCommittedEdgeRecord(record));
    } else if (record.final_action === "reject") {
      results.rejectedEdges.push(buildCommittedEdgeRecord(record));
    } else if (record.final_action === "downgrade") {
      results.downgradedEdges.push(buildCommittedEdgeRecord(record));
    } else if (record.final_action === "reclassify") {
      results.reclassifiedEdges.push(buildCommittedEdgeRecord(record));
    }
  }

  const mergedStore = mergeReviewStore(reviewStore, results.upserts, processedAt);
  const storeWrite = request.options.write_store
    ? writeGraphReviewStore(storePath, mergedStore)
    : {
        store_path: storePath,
        written: false,
        total_decisions_after_write: mergedStore.decisions.length
      };

  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    status: results.unresolvedCandidates.length ? "needs_review" : "success",
    graph_skill: request.graph_result.skill || "relationship-graph",
    processed_at: processedAt,
    review_summary: buildGraphReviewSummaryArtifact({
      decisionCount: request.review_decisions.length,
      confirmedCount: results.confirmedEdges.length,
      rejectedCount: results.rejectedEdges.length,
      downgradedCount: results.downgradedEdges.length,
      reclassifiedCount: results.reclassifiedEdges.length,
      deferredCount: results.deferredEdges.length,
      unresolvedCount: results.unresolvedCandidates.length
    }),
    confirmed_edges: results.confirmedEdges,
    rejected_edges: results.rejectedEdges,
    downgraded_edges: results.downgradedEdges,
    reclassified_edges: results.reclassifiedEdges,
    deferred_edges: results.deferredEdges,
    unresolved_candidates: results.unresolvedCandidates,
    graph_review_store_delta: buildGraphReviewStoreDeltaArtifact({
      upserts: results.upserts,
      storeWrite
    }),
    commit_feedback: buildGraphCommitFeedback(results),
    notes: request.notes || ""
  };
}

function validateGraphReviewResolutionRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("graph review request 必须是对象");
  }

  const graphResult = payload.graph_result;
  if (!graphResult || typeof graphResult !== "object") {
    throw new Error("缺少 graph_result");
  }
  if (graphResult.skill !== "relationship-graph") {
    throw new Error("graph_result.skill 必须是 relationship-graph");
  }

  const reviewDecisions = Array.isArray(payload.review_decisions) ? payload.review_decisions : [];
  const options = {
    ...DEFAULT_OPTIONS,
    ...(payload.options && typeof payload.options === "object" ? payload.options : {})
  };

  reviewDecisions.forEach((decision, index) => {
    if (!decision || typeof decision !== "object") {
      throw new Error(`review_decisions[${index}] 必须是对象`);
    }
    if (!normalizeString(decision.source_person_ref || decision.source_person_name)) {
      throw new Error(`review_decisions[${index}] 缺少 source 人物`);
    }
    if (!normalizeString(decision.target_person_ref || decision.target_person_name)) {
      throw new Error(`review_decisions[${index}] 缺少 target 人物`);
    }
    if (!["confirm", "reject", "downgrade", "reclassify", "defer"].includes(normalizeGraphReviewAction(decision.final_action))) {
      throw new Error(`review_decisions[${index}] final_action 非法`);
    }
  });

  return {
    skill: normalizeString(payload.skill) || SKILL_NAME,
    version: normalizeString(payload.version) || SKILL_VERSION,
    graph_result: graphResult,
    review_decisions: reviewDecisions,
    graph_review_store_path: normalizeString(payload.graph_review_store_path) || defaultReviewStorePath,
    operator: normalizeString(payload.operator),
    notes: normalizeString(payload.notes),
    options
  };
}

function buildCandidateMap(graphResult) {
  const candidates = Array.isArray(graphResult.review_bundle?.edge_candidates)
    ? graphResult.review_bundle.edge_candidates
    : [];
  const map = new Map();
  candidates.forEach((candidate) => {
    const normalized = normalizeCandidate(candidate);
    map.set(normalized.edge_key, normalized);
  });
  return map;
}

function normalizeCandidate(candidate) {
  const sourceRef = normalizeString(candidate.source_person_ref);
  const targetRef = normalizeString(candidate.target_person_ref);
  const sourceName = normalizeString(candidate.source_person_name);
  const targetName = normalizeString(candidate.target_person_name);
  return {
    edge_key: edgeKey(sourceRef || sourceName, targetRef || targetName),
    source_person_ref: sourceRef,
    source_person_name: sourceName,
    target_person_ref: targetRef,
    target_person_name: targetName,
    relation_type: normalizeString(candidate.relation_type),
    relation_score: Number.isFinite(Number(candidate.relation_score)) ? Number(candidate.relation_score) : 0,
    reason: normalizeString(candidate.reason),
    suggested_action: normalizeString(candidate.suggested_action),
    review_priority: Number.isFinite(Number(candidate.review_priority)) ? Number(candidate.review_priority) : 0
  };
}

function buildDecisionMap(reviewDecisions) {
  const map = new Map();
  for (const decision of reviewDecisions) {
    const normalized = normalizeDecision(decision);
    map.set(normalized.edge_key, normalized);
  }
  return map;
}

function normalizeDecision(decision) {
  const sourceRef = normalizeString(decision.source_person_ref);
  const targetRef = normalizeString(decision.target_person_ref);
  const sourceName = normalizeString(decision.source_person_name);
  const targetName = normalizeString(decision.target_person_name);
  return {
    edge_key: edgeKey(sourceRef || sourceName, targetRef || targetName),
    source_person_ref: sourceRef,
    source_person_name: sourceName,
    target_person_ref: targetRef,
    target_person_name: targetName,
    final_action: normalizeGraphReviewAction(decision.final_action),
    corrected_relation_type: normalizeNullableString(decision.corrected_relation_type),
    note: normalizeString(decision.note)
  };
}

function finalizeDecisionRecord({ candidate, decision, processedAt, operator }) {
  return {
    edge_key: candidate.edge_key,
    source_person_ref: candidate.source_person_ref,
    source_person_name: candidate.source_person_name,
    target_person_ref: candidate.target_person_ref,
    target_person_name: candidate.target_person_name,
    final_action: decision.final_action,
    corrected_relation_type: decision.corrected_relation_type,
    note: decision.note,
    operator,
    reviewed_at: processedAt,
    relation_type: candidate.relation_type,
    relation_score: candidate.relation_score
  };
}

function buildCommittedEdgeRecord(record) {
  return {
    source_person_name: record.source_person_name,
    source_person_ref: record.source_person_ref,
    target_person_name: record.target_person_name,
    target_person_ref: record.target_person_ref,
    final_action: record.final_action,
    corrected_relation_type: record.corrected_relation_type,
    note: record.note,
    reviewed_at: record.reviewed_at
  };
}

function buildUnresolvedCandidate(candidate) {
  return {
    source_person_name: candidate.source_person_name,
    source_person_ref: candidate.source_person_ref,
    target_person_name: candidate.target_person_name,
    target_person_ref: candidate.target_person_ref,
    relation_type: candidate.relation_type,
    relation_score: candidate.relation_score,
    reason: candidate.reason
  };
}

function _buildCommitFeedback(results) {
  const summaryLines = [
    `已确认 ${results.confirmedEdges.length} 条关系边`,
    `已拒绝 ${results.rejectedEdges.length} 条关系边`,
    `仍待处理 ${results.unresolvedCandidates.length} 条关系边`
  ];

  return {
    headline: results.unresolvedCandidates.length
      ? "关系边决议已部分写回，但还有待处理候选"
      : "关系边决议已写回 graph review store",
    summary_lines: summaryLines,
    next_action: results.unresolvedCandidates.length
      ? {
          type: "continue_review",
          message: `建议继续处理剩余 ${results.unresolvedCandidates.length} 条边，避免 graph 里长期保留弱关系候选`
        }
      : {
          type: "rerun_graph",
          message: "建议重新运行 graph skill，查看人工确认后的最新网络结果"
        }
  };
}

function buildGraphCommitFeedback(results) {
  const summaryLines = [
    `已确认 ${results.confirmedEdges.length} 条关系边`,
    `已拒绝 ${results.rejectedEdges.length} 条关系边`,
    `仍待处理 ${results.unresolvedCandidates.length} 条关系边`
  ];

  return buildCommitFeedbackArtifact({
    headline: results.unresolvedCandidates.length
      ? "关系边决议已部分写回，但还有待处理候选"
      : "关系边决议已写回 graph review store",
    summaryLines,
    nextAction: results.unresolvedCandidates.length
      ? {
          type: "continue_review",
          message: `建议继续处理剩余 ${results.unresolvedCandidates.length} 条边，避免 graph 里长期保留弱关系候选`
        }
      : {
          type: "rerun_graph",
          message: "建议重新运行 graph skill，查看人工确认后的最新网络结构"
        }
  });
}

function loadGraphReviewStore(storePath) {
  return loadGraphReviewStoreState({
    storePath,
    defaultStorePath: defaultReviewStorePath,
    version: SKILL_VERSION,
    normalizeDecision: normalizeStoredDecision
  });
}

function mergeReviewStore(store, upserts, processedAt) {
  const next = new Map((store.decisions || []).map((decision) => [decision.edge_key, decision]));
  upserts.forEach((record) => {
    next.set(record.edge_key, normalizeStoredDecision(record));
  });
  return {
    version: SKILL_VERSION,
    updated_at: processedAt,
    decisions: Array.from(next.values()).sort((left, right) => left.edge_key.localeCompare(right.edge_key, "zh-Hans-CN"))
  };
}

function writeGraphReviewStore(storePath, store) {
  return writeGraphReviewStoreState({
    storePath,
    defaultStorePath: defaultReviewStorePath,
    store
  });
}

function normalizeStoredDecision(decision) {
  return {
    edge_key: normalizeString(decision.edge_key),
    source_person_ref: normalizeString(decision.source_person_ref),
    source_person_name: normalizeString(decision.source_person_name),
    target_person_ref: normalizeString(decision.target_person_ref),
    target_person_name: normalizeString(decision.target_person_name),
    final_action: normalizeGraphReviewAction(decision.final_action),
    corrected_relation_type: normalizeNullableString(decision.corrected_relation_type),
    note: normalizeString(decision.note),
    operator: normalizeString(decision.operator),
    reviewed_at: normalizeString(decision.reviewed_at),
    relation_type: normalizeString(decision.relation_type),
    relation_score: Number.isFinite(Number(decision.relation_score)) ? Number(decision.relation_score) : 0
  };
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeGraphReviewAction(value) {
  const candidate = normalizeKey(value);
  if (["confirm", "reject", "downgrade", "reclassify", "defer"].includes(candidate)) {
    return candidate;
  }
  return "defer";
}

function edgeKey(left, right) {
  return [left, right].map((item) => normalizeString(item)).sort().join("::");
}

