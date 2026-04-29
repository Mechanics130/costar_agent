// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { __profile_internal, getRelationshipProfileSkillInfo } from "../../relationship-profile/runtime/relationship-profile.mjs";
import { getRelationshipGraphSkillInfo, runRelationshipGraph } from "../../relationship-graph/runtime/relationship-graph.mjs";
import { loadProfileStore as loadProfileStoreState } from "../../costar-core/stores/profile-store.mjs";
import {
  loadViewStore as loadViewStoreState,
  writeViewStore as writeViewStoreState
} from "../../costar-core/stores/view-store.mjs";
import {
  hasAttitudeIntentContent,
  normalizeAttitudeIntent,
  normalizeKeyIssues,
  normalizeLatentNeeds
} from "../../costar-core/relationship-insights.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const runsDir = path.join(__dirname, "runs");
const storesDir = path.join(__dirname, "stores");
const markdownViewsDir = path.join(skillRoot, "views");

const { default_store_path: defaultProfileStorePath } = getRelationshipProfileSkillInfo();
const { default_review_store_path: defaultGraphReviewStorePath } = getRelationshipGraphSkillInfo();

const SKILL_NAME = "relationship-view";
const SKILL_VERSION = "0.1.0";
const DEFAULT_OPTIONS = {
  write_store: true,
  write_markdown: true,
  save_run_artifacts: true,
  refresh_limit: 20,
  related_people_limit: 6,
  timeline_limit: 6,
  graph_max_nodes: 8,
  graph_max_edges: 12,
  graph_min_relation_score: 2
};
const VIEW_STORE_FILE = path.join(storesDir, "relationship-view-store.json");

export function getRelationshipViewSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    default_profile_store_path: defaultProfileStorePath,
    default_graph_review_store_path: defaultGraphReviewStorePath,
    default_view_store_path: VIEW_STORE_FILE,
    default_markdown_dir: markdownViewsDir
  };
}

export function runRelationshipView(payload) {
  const request = validateViewRequest(payload);
  const profileStore = loadProfileStore(request.profile_store_path);
  const currentViewStore = loadViewStore(request.view_store_path);
  const processedAt = new Date().toISOString();

  let response;
  if (request.mode === "get_person_view") {
    response = handleGetPersonView({
      request,
      profileStore,
      currentViewStore,
      processedAt
    });
  } else if (request.mode === "refresh_person_view") {
    response = handleRefreshPersonView({
      request,
      profileStore,
      currentViewStore,
      processedAt
    });
  } else {
    response = handleRefreshPeopleViews({
      request,
      profileStore,
      currentViewStore,
      processedAt
    });
  }

  if (request.options.save_run_artifacts) {
    response.run_directory = persistRunArtifacts({ request, response });
  } else {
    response.run_directory = null;
  }

  return response;
}

function handleGetPersonView({ request, profileStore, currentViewStore, processedAt }) {
  const target = resolveProfileTarget({
    profiles: profileStore.profiles,
    personName: request.person_name,
    personRef: request.person_ref
  });

  if (!target.profile) {
    return buildBaseResponse({
      status: "needs_review",
      mode: request.mode,
      profileStore,
      viewStore: currentViewStore,
      personView: null,
      refreshedViews: [],
      notes: target.note || "未找到唯一匹配的人物，建议先确认人物输入。"
    });
  }

  const existingView = currentViewStore.views.find((view) => view.person_ref === target.profile.person_ref);
  const personView = existingView || buildPersonView({
    profile: target.profile,
    profileStorePath: request.profile_store_path,
    graphReviewStorePath: request.graph_review_store_path,
    options: request.options,
    processedAt
  });

  if (!existingView && (request.options.write_store || request.options.write_markdown)) {
    const writeResult = persistViews({
      request,
      currentViewStore,
      views: [personView],
      profileStorePath: request.profile_store_path,
      graphReviewStorePath: request.graph_review_store_path,
      processedAt
    });

    return buildBaseResponse({
      status: "success",
      mode: request.mode,
      profileStore,
      viewStore: writeResult.store,
      personView,
      refreshedViews: [summarizeView(personView)],
      viewStoreDelta: writeResult.delta,
      userFeedback: buildUserFeedbackForGet(personView),
      notes: "目标人物视图原本不存在，已按当前 store 自动生成。"
    });
  }

  return buildBaseResponse({
    status: "success",
    mode: request.mode,
    profileStore,
    viewStore: currentViewStore,
    personView,
    refreshedViews: [],
    userFeedback: buildUserFeedbackForGet(personView),
    notes: ""
  });
}

function handleRefreshPersonView({ request, profileStore, currentViewStore, processedAt }) {
  const target = resolveProfileTarget({
    profiles: profileStore.profiles,
    personName: request.person_name,
    personRef: request.person_ref
  });

  if (!target.profile) {
    return buildBaseResponse({
      status: "needs_review",
      mode: request.mode,
      profileStore,
      viewStore: currentViewStore,
      personView: null,
      refreshedViews: [],
      notes: target.note || "未找到唯一匹配的人物，建议先确认人物输入。"
    });
  }

  const personView = buildPersonView({
    profile: target.profile,
    profileStorePath: request.profile_store_path,
    graphReviewStorePath: request.graph_review_store_path,
    options: request.options,
    processedAt
  });

  const writeResult = persistViews({
    request,
    currentViewStore,
    views: [personView],
    profileStorePath: request.profile_store_path,
    graphReviewStorePath: request.graph_review_store_path,
    processedAt
  });

  return buildBaseResponse({
    status: "success",
    mode: request.mode,
    profileStore,
    viewStore: writeResult.store,
    personView,
    refreshedViews: [summarizeView(personView)],
    viewStoreDelta: writeResult.delta,
    userFeedback: buildUserFeedbackForRefresh([personView]),
    notes: ""
  });
}

function handleRefreshPeopleViews({ request, profileStore, currentViewStore, processedAt }) {
  const selectedProfiles = selectProfilesForRefresh({
    profiles: profileStore.profiles,
    request,
    currentViewStore
  });

  if (!selectedProfiles.length) {
    return buildBaseResponse({
      status: "needs_review",
      mode: request.mode,
      profileStore,
      viewStore: currentViewStore,
      personView: null,
      refreshedViews: [],
      notes: "当前没有可刷新的目标人物。"
    });
  }

  const views = selectedProfiles.map((profile) =>
    buildPersonView({
      profile,
      profileStorePath: request.profile_store_path,
      graphReviewStorePath: request.graph_review_store_path,
      options: request.options,
      processedAt
    })
  );

  const writeResult = persistViews({
    request,
    currentViewStore,
    views,
    profileStorePath: request.profile_store_path,
    graphReviewStorePath: request.graph_review_store_path,
    processedAt
  });

  return buildBaseResponse({
    status: "success",
    mode: request.mode,
    profileStore,
    viewStore: writeResult.store,
    personView: null,
    refreshedViews: views.map(summarizeView),
    viewStoreDelta: writeResult.delta,
    userFeedback: buildUserFeedbackForRefresh(views),
    notes: ""
  });
}

function buildPersonView({ profile, profileStorePath, graphReviewStorePath, options, processedAt }) {
  const graphResult = runRelationshipGraph({
    mode: "get_person_graph",
    profile_store_path: profileStorePath,
    graph_review_store_path: graphReviewStorePath,
    person_ref: profile.person_ref,
    options: {
      save_run_artifacts: false,
      max_nodes: options.graph_max_nodes,
      max_edges: options.graph_max_edges,
      min_relation_score: options.graph_min_relation_score
    }
  });

  const strongestConnection = Array.isArray(graphResult.related_people) && graphResult.related_people.length
    ? graphResult.related_people[0]
    : null;
  const markdownPath = path.join(options.markdown_dir, `${profile.person_ref}.md`);

  return {
    person_name: profile.person_name,
    person_ref: profile.person_ref,
    profile_tier: profile.profile_tier || "active",
    confidence: profile.confidence || "medium",
    refreshed_at: processedAt,
    summary_card: {
      summary: normalizeString(profile.compiled_truth?.summary),
      current_judgment: normalizeString(profile.compiled_truth?.current_judgment),
      relationship_stage: normalizeString(profile.compiled_truth?.relationship_stage),
      intent: normalizeString(profile.compiled_truth?.intent),
      attitude: profile.compiled_truth?.attitude || null,
      tags: normalizeStringArray(profile.compiled_truth?.tags),
      traits: normalizeStringArray(profile.compiled_truth?.traits),
      preferences: normalizeStringArray(profile.compiled_truth?.preferences),
      boundaries: normalizeStringArray(profile.compiled_truth?.boundaries),
      risk_flags: normalizeStringArray(profile.compiled_truth?.risk_flags),
      open_questions: normalizeStringArray(profile.compiled_truth?.open_questions),
      next_actions: normalizeStringArray(profile.compiled_truth?.next_actions)
    },
    insight_card: {
      latent_needs: normalizeLatentNeeds(profile.compiled_truth?.latent_needs),
      key_issues: normalizeKeyIssues(profile.compiled_truth?.key_issues),
      attitude_intent: normalizeAttitudeIntent(profile.compiled_truth?.attitude_intent)
    },
    evidence_summary: {
      excerpt_count: Number(profile.evidence_summary?.excerpt_count || 0),
      source_count: Number(profile.evidence_summary?.source_count || 0),
      last_updated_at: normalizeString(profile.evidence_summary?.last_updated_at),
      key_evidence: normalizeStringArray(profile.evidence_summary?.key_evidence)
    },
    timeline_highlights: buildTimelineHighlights(profile.timeline, options.timeline_limit),
    related_people: Array.isArray(graphResult.related_people) ? graphResult.related_people : [],
    graph_snapshot: {
      node_count: Number(graphResult.render_artifacts?.node_count || 0),
      edge_count: Number(graphResult.render_artifacts?.edge_count || 0),
      pending_edge_count: Number(graphResult.review_bundle?.pending_edge_count || 0),
      strongest_connection: strongestConnection
        ? {
            person_name: strongestConnection.person_name,
            person_ref: strongestConnection.person_ref,
            relation_type: strongestConnection.relation_type,
            relation_score: strongestConnection.relation_score
          }
        : null,
      mermaid: normalizeString(graphResult.render_artifacts?.mermaid)
    },
    review_snapshot: {
      required: Boolean(graphResult.review_bundle?.required),
      pending_edge_count: Number(graphResult.review_bundle?.pending_edge_count || 0),
      edge_candidates: Array.isArray(graphResult.review_bundle?.edge_candidates)
        ? graphResult.review_bundle.edge_candidates.slice(0, 6)
        : [],
      review_notes: Array.isArray(graphResult.review_bundle?.review_notes)
        ? graphResult.review_bundle.review_notes
        : []
    },
    user_feedback: graphResult.user_feedback || null,
    markdown_path: markdownPath,
    source_context: {
      profile_store_path: profileStorePath,
      graph_review_store_path: graphReviewStorePath
    }
  };
}

function persistViews({ request, currentViewStore, views, profileStorePath, graphReviewStorePath, processedAt }) {
  const nextStore = mergeViewStore({
    currentViewStore,
    views,
    profileStorePath,
    graphReviewStorePath,
    processedAt
  });

  const delta = {
    store_path: request.view_store_path,
    written: false,
    markdown_written_count: 0,
    total_views_after_write: nextStore.views.length,
    refreshed_people: views.map((view) => ({
      person_name: view.person_name,
      person_ref: view.person_ref,
      markdown_path: view.markdown_path
    }))
  };

  if (request.options.write_store) {
    const writeResult = writeViewStoreState({
      storePath: request.view_store_path,
      defaultStorePath: VIEW_STORE_FILE,
      store: nextStore
    });
    delta.written = writeResult.written;
  }

  if (request.options.write_markdown) {
    ensureDirectory(request.options.markdown_dir);
    views.forEach((view) => {
      writeFileSync(view.markdown_path, renderPersonViewMarkdown(view), "utf8");
    });
    writeFileSync(path.join(request.options.markdown_dir, "INDEX.md"), renderIndexMarkdown(nextStore.views), "utf8");
    delta.markdown_written_count = views.length;
  }

  return {
    store: nextStore,
    delta
  };
}

function mergeViewStore({ currentViewStore, views, profileStorePath, graphReviewStorePath, processedAt }) {
  const existing = new Map((currentViewStore.views || []).map((view) => [view.person_ref, view]));
  views.forEach((view) => existing.set(view.person_ref, view));

  const mergedViews = Array.from(existing.values()).sort((left, right) => {
    const leftTier = tierScore(left.profile_tier);
    const rightTier = tierScore(right.profile_tier);
    if (rightTier !== leftTier) return rightTier - leftTier;
    return left.person_name.localeCompare(right.person_name, "zh-Hans-CN");
  });

  return {
    version: SKILL_VERSION,
    updated_at: processedAt,
    profile_store_path: profileStorePath,
    graph_review_store_path: graphReviewStorePath,
    views: mergedViews
  };
}

function selectProfilesForRefresh({ profiles, request }) {
  if (Array.isArray(request.people) && request.people.length) {
    const selected = request.people
      .map((item) => resolveProfileTarget({
        profiles,
        personName: item.person_name || item.personName || item.name,
        personRef: item.person_ref || item.personRef
      }).profile)
      .filter(Boolean);
    return dedupeProfiles(selected);
  }

  return [...profiles]
    .sort((left, right) => {
      const tierDelta = tierScore(right.profile_tier) - tierScore(left.profile_tier);
      if (tierDelta !== 0) return tierDelta;
      const confidenceDelta = confidenceScore(right.confidence) - confidenceScore(left.confidence);
      if (confidenceDelta !== 0) return confidenceDelta;
      return left.person_name.localeCompare(right.person_name, "zh-Hans-CN");
    })
    .slice(0, request.options.refresh_limit);
}

function resolveProfileTarget({ profiles, personName, personRef }) {
  if (personRef) {
    const matched = profiles.find((profile) => profile.person_ref === personRef);
    return matched
      ? { profile: matched, note: "" }
      : { profile: null, note: "未按 person_ref 找到人物档案。" };
  }

  const normalized = normalizeKey(personName);
  if (!normalized) {
    return { profile: null, note: "缺少人物标识。" };
  }

  const candidates = profiles.filter((profile) => {
    if (normalizeKey(profile.person_name) === normalized) return true;
    return Array.isArray(profile.aliases)
      ? profile.aliases.some((alias) => normalizeKey(alias) === normalized)
      : false;
  });

  if (candidates.length === 1) {
    return { profile: candidates[0], note: "" };
  }

  if (candidates.length > 1) {
    return { profile: null, note: "人物命中多个档案，建议改用 person_ref。" };
  }

  return { profile: null, note: "未找到匹配的人物档案。" };
}

function loadProfileStore(storePath) {
  return loadProfileStoreState({
    storePath,
    defaultStorePath: defaultProfileStorePath,
    version: SKILL_VERSION,
    normalizeProfile: __profile_internal.normalizeRelationshipProfile
  });
}

function loadViewStore(storePath) {
  return loadViewStoreState({
    storePath,
    defaultStorePath: VIEW_STORE_FILE,
    version: SKILL_VERSION
  });
}

function buildTimelineHighlights(timeline, limit) {
  if (!Array.isArray(timeline)) {
    return [];
  }
  return timeline.slice(0, limit).map((item) => ({
    date: normalizeString(item.date),
    source_title: normalizeString(item.source_title),
    source_id: normalizeString(item.source_id),
    event_summary: normalizeString(item.event_summary)
  }));
}

function renderPersonViewMarkdown(view) {
  const lines = [
    `# 人物视图：${view.person_name}`,
    "",
    `- 人物ID：\`${view.person_ref}\``,
    `- 层级：${view.profile_tier}`,
    `- 置信度：${view.confidence}`,
    `- 更新时间：${view.refreshed_at}`,
    ""
  ];

  if (view.summary_card.summary) {
    lines.push("## 最新摘要", "", view.summary_card.summary, "");
  }
  if (view.summary_card.current_judgment) {
    lines.push("## 当前判断", "", view.summary_card.current_judgment, "");
  }
  if (view.summary_card.intent || view.summary_card.relationship_stage) {
    lines.push("## 关系判断", "");
    if (view.summary_card.relationship_stage) lines.push(`- 关系阶段：${view.summary_card.relationship_stage}`);
    if (view.summary_card.intent) lines.push(`- 当前意图：${view.summary_card.intent}`);
    if (view.summary_card.attitude?.label) lines.push(`- 态度判断：${view.summary_card.attitude.label}${view.summary_card.attitude.reason ? `（${view.summary_card.attitude.reason}）` : ""}`);
    lines.push("");
  }

  appendInsightSections(lines, view.insight_card);

  appendListSection(lines, "关键标签", view.summary_card.tags);
  appendListSection(lines, "人物特点", view.summary_card.traits);
  appendListSection(lines, "偏好", view.summary_card.preferences);
  appendListSection(lines, "风险提示", view.summary_card.risk_flags);
  appendListSection(lines, "开放问题", view.summary_card.open_questions);
  appendListSection(lines, "下一步建议", view.summary_card.next_actions);

  lines.push("## 关系网络概览", "");
  if (view.graph_snapshot.strongest_connection) {
    lines.push(`- 最强连接：${view.graph_snapshot.strongest_connection.person_name}（${view.graph_snapshot.strongest_connection.relation_type} / ${view.graph_snapshot.strongest_connection.relation_score}）`);
  }
  lines.push(`- 图节点数：${view.graph_snapshot.node_count}`);
  lines.push(`- 图关系边数：${view.graph_snapshot.edge_count}`);
  lines.push(`- 待确认关系边：${view.graph_snapshot.pending_edge_count}`);
  lines.push("");

  if (view.graph_snapshot.mermaid) {
    lines.push("```mermaid");
    lines.push(view.graph_snapshot.mermaid);
    lines.push("```", "");
  }

  if (Array.isArray(view.related_people) && view.related_people.length) {
    lines.push("## 关键相邻人物", "");
    view.related_people.forEach((item) => {
      lines.push(`- ${item.person_name}：${item.relation_type} / ${item.relation_score}`);
    });
    lines.push("");
  }

  if (view.review_snapshot.pending_edge_count > 0) {
    lines.push("## 待确认关系边", "");
    view.review_snapshot.edge_candidates.forEach((candidate) => {
      lines.push(`- ${candidate.source_person_name} ↔ ${candidate.target_person_name}：${candidate.reason}`);
    });
    lines.push("");
  }

  if (Array.isArray(view.timeline_highlights) && view.timeline_highlights.length) {
    lines.push("## 时间线摘录", "");
    view.timeline_highlights.forEach((item) => {
      lines.push(`- ${item.date || "待判断"} / ${item.source_title || item.source_id}`);
      if (item.event_summary) {
        lines.push(`  ${item.event_summary}`);
      }
    });
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderIndexMarkdown(views) {
  const lines = [
    "# 关系视图索引",
    "",
    `- 视图总数：${views.length}`,
    ""
  ];

  views.forEach((view) => {
    const fileName = path.basename(view.markdown_path || `${view.person_ref}.md`);
    lines.push(`- [${view.person_name}](./${fileName}) · ${view.profile_tier} · ${view.confidence} · 更新于 ${view.refreshed_at}`);
  });

  lines.push("");
  return `${lines.join("\n")}`;
}

function appendListSection(lines, title, items) {
  if (!Array.isArray(items) || !items.length) {
    return;
  }
  lines.push(`## ${title}`, "");
  items.forEach((item) => lines.push(`- ${item}`));
  lines.push("");
}

function appendInsightSections(lines, insightCard) {
  const latentNeeds = insightCard?.latent_needs || { counterpart: [], self: [] };
  if (latentNeeds.counterpart.length || latentNeeds.self.length) {
    lines.push("## 隐性需求", "");
    latentNeeds.counterpart.forEach((item) => lines.push(`- 对方：${formatNeedInsight(item)}`));
    latentNeeds.self.forEach((item) => lines.push(`- 我方：${formatNeedInsight(item)}`));
    lines.push("");
  }

  const keyIssues = Array.isArray(insightCard?.key_issues) ? insightCard.key_issues : [];
  if (keyIssues.length) {
    lines.push("## 关键议题", "");
    keyIssues.forEach((item) => {
      const consensus = item.consensus.length ? `；共识：${item.consensus.join(" / ")}` : "";
      const nonConsensus = item.non_consensus.length ? `；非共识：${item.non_consensus.join(" / ")}` : "";
      const quotes = item.key_quotes.length ? `；关键语句：${item.key_quotes.join(" / ")}` : "";
      lines.push(`- ${item.issue}（${item.confidence}）${consensus}${nonConsensus}${quotes}`);
    });
    lines.push("");
  }

  const attitudeIntent = insightCard?.attitude_intent;
  if (
    attitudeIntent &&
    (hasAttitudeIntentContent(attitudeIntent.counterpart) || hasAttitudeIntentContent(attitudeIntent.self))
  ) {
    lines.push("## 态度与意图", "");
    lines.push(`- 对方：态度=${attitudeIntent.counterpart.attitude}；意图=${attitudeIntent.counterpart.intent}；置信度=${attitudeIntent.counterpart.confidence}`);
    lines.push(`- 我方：态度=${attitudeIntent.self.attitude}；意图=${attitudeIntent.self.intent}；置信度=${attitudeIntent.self.confidence}`);
    lines.push("");
  }
}

function formatNeedInsight(item) {
  const evidence = item.evidence.length ? `；证据：${item.evidence.join(" / ")}` : "";
  return `${item.need}（${item.confidence}）${evidence}`;
}

function summarizeView(view) {
  return {
    person_name: view.person_name,
    person_ref: view.person_ref,
    profile_tier: view.profile_tier,
    confidence: view.confidence,
    refreshed_at: view.refreshed_at,
    pending_edge_count: view.graph_snapshot.pending_edge_count,
    markdown_path: view.markdown_path
  };
}

function buildUserFeedbackForGet(view) {
  return {
    headline: `已读取 ${view.person_name} 的持续关系视图`,
    summary_lines: [
      `当前层级：${view.profile_tier}`,
      `图中有 ${view.graph_snapshot.node_count} 个节点 / ${view.graph_snapshot.edge_count} 条边`,
      view.graph_snapshot.pending_edge_count
        ? `还有 ${view.graph_snapshot.pending_edge_count} 条关系边建议确认`
        : "当前主要关系边看起来比较稳定"
    ],
    next_action: view.graph_snapshot.pending_edge_count
      ? {
          type: "review_graph_edges",
          message: `建议先确认 ${view.person_name} 视图里的待确认关系边。`
        }
      : {
          type: "follow_up",
          message: `可以继续补 ${view.person_name} 的新互动资料，保持视图持续更新。`
        }
  };
}

function buildUserFeedbackForRefresh(views) {
  const first = views[0];
  return {
    headline: views.length === 1
      ? `已刷新 ${first.person_name} 的持续关系视图`
      : `已刷新 ${views.length} 份持续关系视图`,
    summary_lines: [
      `本次刷新人物数：${views.length}`,
      `其中待确认关系边总数：${views.reduce((sum, view) => sum + Number(view.graph_snapshot.pending_edge_count || 0), 0)}`,
      `已同步写入 markdown 视图文件`
    ],
    next_action: {
      type: "inspect_markdown_views",
      message: "可以直接打开对应人物的 markdown 视图文件检查 summary 和 graph。"
    }
  };
}

function buildBaseResponse({
  status,
  mode,
  profileStore,
  viewStore,
  personView,
  refreshedViews,
  viewStoreDelta = null,
  userFeedback = null,
  notes = ""
}) {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    status,
    mode,
    target_person: personView
      ? {
          person_name: personView.person_name,
          person_ref: personView.person_ref,
          profile_tier: personView.profile_tier
        }
      : null,
    person_view: personView,
    refreshed_views: refreshedViews,
    view_store_overview: {
      profile_count: profileStore.profiles.length,
      view_count: Array.isArray(viewStore.views) ? viewStore.views.length : 0,
      updated_at: viewStore.updated_at || profileStore.updated_at || ""
    },
    view_store_delta: viewStoreDelta,
    user_feedback: userFeedback,
    notes
  };
}

function validateViewRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("relationship-view request 必须是 JSON 对象。");
  }

  const options = {
    ...DEFAULT_OPTIONS,
    ...(payload.options && typeof payload.options === "object" ? payload.options : {})
  };

  const mode = normalizeString(payload.mode) || deriveMode(payload);
  if (!["get_person_view", "refresh_person_view", "refresh_people_views"].includes(mode)) {
    throw new Error(`不支持的 relationship-view mode: ${mode}`);
  }

  return {
    mode,
    person_name: normalizeString(payload.person_name),
    person_ref: normalizeString(payload.person_ref),
    people: Array.isArray(payload.people) ? payload.people : [],
    profile_store_path: normalizeString(payload.profile_store_path) || defaultProfileStorePath,
    graph_review_store_path: normalizeString(payload.graph_review_store_path) || defaultGraphReviewStorePath,
    view_store_path: normalizeString(payload.view_store_path) || VIEW_STORE_FILE,
    options: {
      write_store: options.write_store !== false,
      write_markdown: options.write_markdown !== false,
      save_run_artifacts: options.save_run_artifacts !== false,
      refresh_limit: clampInteger(options.refresh_limit, DEFAULT_OPTIONS.refresh_limit, 1, 200),
      related_people_limit: clampInteger(options.related_people_limit, DEFAULT_OPTIONS.related_people_limit, 1, 20),
      timeline_limit: clampInteger(options.timeline_limit, DEFAULT_OPTIONS.timeline_limit, 1, 20),
      graph_max_nodes: clampInteger(options.graph_max_nodes, DEFAULT_OPTIONS.graph_max_nodes, 3, 50),
      graph_max_edges: clampInteger(options.graph_max_edges, DEFAULT_OPTIONS.graph_max_edges, 3, 100),
      graph_min_relation_score: clampInteger(options.graph_min_relation_score, DEFAULT_OPTIONS.graph_min_relation_score, 1, 100),
      markdown_dir: normalizeString(options.markdown_dir) || markdownViewsDir
    }
  };
}

function deriveMode(payload) {
  if (Array.isArray(payload.people) && payload.people.length) {
    return "refresh_people_views";
  }
  if (payload.person_name || payload.person_ref) {
    return "refresh_person_view";
  }
  return "refresh_people_views";
}

function dedupeProfiles(profiles) {
  const map = new Map();
  profiles.forEach((profile) => {
    if (profile?.person_ref) {
      map.set(profile.person_ref, profile);
    }
  });
  return Array.from(map.values());
}

function tierScore(value) {
  return {
    archived: 0,
    stub: 1,
    active: 2,
    key: 3
  }[normalizeKey(value)] ?? 0;
}

function confidenceScore(value) {
  return {
    low: 1,
    medium: 2,
    high: 3
  }[normalizeKey(value)] ?? 0;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(new Set(values.map((item) => normalizeString(item)).filter(Boolean)));
}

function clampInteger(value, fallback, min, max) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(candidate)));
}

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function persistRunArtifacts({ request, response }) {
  ensureDirectory(runsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = normalizeKey(request.person_ref || request.person_name || request.mode || "view")
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, "-");
  const runDirectory = path.join(runsDir, `${stamp}-${safeId || "view"}`);
  ensureDirectory(runDirectory);
  writeFileSync(path.join(runDirectory, "request.json"), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "response.json"), `${JSON.stringify(response, null, 2)}\n`, "utf8");
  return runDirectory;
}

