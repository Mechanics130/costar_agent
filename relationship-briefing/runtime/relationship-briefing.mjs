// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasAttitudeIntentContent,
  normalizeAttitudeIntent,
  normalizeKeyIssues,
  normalizeLatentNeeds
} from "../../costar-core/relationship-insights.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const promptPath = path.join(skillRoot, "prompts", "relationship-briefing.system.prompt.md");
const runsDir = path.join(__dirname, "runs");
const briefingsDir = path.join(skillRoot, "briefings");
const sharedModelConfigPath = path.resolve(
  skillRoot,
  "..",
  "relationship-ingestion",
  "runtime",
  "model-config.local.json"
);
const defaultViewStorePath = path.resolve(
  skillRoot,
  "..",
  "relationship-view",
  "runtime",
  "stores",
  "relationship-view-store.json"
);
const defaultViewMarkdownDir = path.resolve(skillRoot, "..", "relationship-view", "views");

const SKILL_NAME = "relationship-briefing";
const SKILL_VERSION = "0.2.0";
const DEFAULT_OPTIONS = {
  save_run_artifacts: true,
  write_briefing_file: true,
  timeline_limit: 4,
  view_excerpt_chars: 1400
};

export function getRelationshipBriefingSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    briefings_dir: briefingsDir,
    default_view_store_path: defaultViewStorePath,
    default_view_markdown_dir: defaultViewMarkdownDir
  };
}

export async function runRelationshipBriefing(payload) {
  const request = validateBriefingRequest(payload);
  const profile = resolveTargetProfile(request);
  const context = deriveBriefingContext(request, profile);
  const { config, source } = resolveConfiguredModel(request.model_config);
  const messages = buildBriefingMessages({ request, profile, context });
  const raw = await callOpenAICompatibleModel({ config, messages });
  const assistantText = extractAssistantText(raw);
  const parsed = parseJsonPayload(assistantText);
  const result = normalizeBriefingOutput({ parsed, request, profile, context, config, source });
  const briefingFile = request.options.write_briefing_file
    ? writeBriefingMarkdown({ request, result, profile, context })
    : {
        written: false,
        path: "",
        title: "",
        slug: ""
      };
  const response = {
    ...result,
    briefing_file: briefingFile,
    run_directory: null
  };
  if (request.options.save_run_artifacts) {
    response.run_directory = persistRunArtifacts({ request, response, raw });
  }
  return response;
}

function validateBriefingRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("briefing request 必须是对象");
  }
  const conversationGoal = normalizeString(payload.conversation_goal || payload.meeting_context?.goal);
  if (!conversationGoal) {
    throw new Error("缺少 conversation_goal");
  }
  return {
    skill: normalizeString(payload.skill) || SKILL_NAME,
    version: normalizeString(payload.version) || SKILL_VERSION,
    person_name: normalizeString(payload.person_name),
    person_ref: normalizeString(payload.person_ref),
    profile_store_path: normalizeString(payload.profile_store_path),
    target_profile: payload.target_profile && typeof payload.target_profile === "object" ? payload.target_profile : null,
    conversation_goal: conversationGoal,
    conversation_topic: normalizeString(payload.conversation_topic || payload.meeting_context?.topic),
    conversation_context: normalizeString(payload.conversation_context),
    meeting_context: normalizeMeetingContext(payload.meeting_context),
    recent_interactions: normalizeRecentInteractions(payload.recent_interactions),
    constraints: Array.isArray(payload.constraints) ? uniqueStrings(payload.constraints.map((item) => normalizeString(item)).filter(Boolean)) : [],
    model_config: payload.model_config && typeof payload.model_config === "object" ? payload.model_config : null,
    options: {
      ...DEFAULT_OPTIONS,
      ...(payload.options && typeof payload.options === "object" ? payload.options : {})
    }
  };
}

function normalizeMeetingContext(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const topic = normalizeString(value.topic);
  const goal = normalizeString(value.goal);
  const scheduledTime = normalizeString(value.scheduled_time);
  const attendees = Array.isArray(value.attendees)
    ? uniqueStrings(value.attendees.map((item) => normalizeString(item)).filter(Boolean))
    : [];
  const location = normalizeString(value.location);
  const notes = normalizeString(value.notes);
  if (!topic && !goal && !scheduledTime && !attendees.length && !location && !notes) {
    return null;
  }
  return {
    topic,
    goal,
    scheduled_time: scheduledTime,
    attendees,
    location,
    notes
  };
}

function normalizeRecentInteractions(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const summary = normalizeString(item.summary || item.event_summary || item.text);
      if (!summary) {
        return null;
      }
      return {
        interaction_id: normalizeString(item.interaction_id || item.timeline_id) || `interaction-${index + 1}`,
        date: normalizeString(item.date || item.captured_at) || "待判断",
        source_title: normalizeString(item.source_title || item.title),
        source_id: normalizeString(item.source_id),
        summary
      };
    })
    .filter(Boolean);
}

function resolveTargetProfile(request) {
  if (request.target_profile) {
    return request.target_profile;
  }
  if (!request.profile_store_path) {
    throw new Error("缺少 profile_store_path 或 target_profile");
  }
  if (!existsSync(request.profile_store_path)) {
    throw new Error(`profile store 不存在：${request.profile_store_path}`);
  }

  const store = JSON.parse(readFileSync(request.profile_store_path, "utf8").replace(/^\uFEFF/, ""));
  const profiles = Array.isArray(store.profiles) ? store.profiles : [];
  const profile = profiles.find((item) => {
    const sameRef = request.person_ref && normalizeString(item.person_ref) === request.person_ref;
    const sameName = request.person_name && normalizeString(item.person_name) === request.person_name;
    return sameRef || sameName;
  });

  if (!profile) {
    throw new Error(`在 profile store 里未找到目标人物：${request.person_ref || request.person_name}`);
  }
  return profile;
}

function deriveBriefingContext(request, profile) {
  const explicitInteractions = request.recent_interactions;
  const interactions = explicitInteractions.length
    ? explicitInteractions
    : deriveInteractionsFromProfile(profile, request.options.timeline_limit);

  const viewContext = deriveViewContext(profile, request.options.view_excerpt_chars);
  const autoContextApplied = !explicitInteractions.length && (interactions.length > 0 || viewContext.used_view_markdown);

  return {
    interactions,
    view_context: viewContext,
    receipt: {
      auto_context_applied: autoContextApplied,
      auto_context_interaction_count: interactions.length,
      auto_context_used_views: viewContext.used_view_markdown ? 1 : 0,
      auto_context_view_path: viewContext.view_markdown_path,
      auto_context_source: explicitInteractions.length ? "request_recent_interactions" : "profile_store_and_view"
    }
  };
}

function deriveInteractionsFromProfile(profile, limit) {
  const timeline = Array.isArray(profile?.timeline) ? profile.timeline : [];
  return timeline
    .slice(0, Math.max(1, limit))
    .map((item, index) => ({
      interaction_id: normalizeString(item.timeline_id) || `timeline-${index + 1}`,
      date: normalizeString(item.date) || "待判断",
      source_title: normalizeString(item.source_title),
      source_id: normalizeString(item.source_id),
      summary: normalizeString(item.event_summary)
    }))
    .filter((item) => item.summary);
}

function deriveViewContext(profile, maxChars) {
  const candidates = [];
  const personRef = normalizeString(profile?.person_ref);
  const personName = normalizeString(profile?.person_name);
  if (personRef) {
    candidates.push(path.join(defaultViewMarkdownDir, `${personRef}.md`));
  }
  if (personName) {
    candidates.push(path.join(defaultViewMarkdownDir, `person_${slugify(personName)}.md`));
  }

  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    return {
      used_view_markdown: false,
      view_markdown_path: "",
      view_excerpt: ""
    };
  }

  const raw = readFileSync(match, "utf8").replace(/^\uFEFF/, "");
  return {
    used_view_markdown: true,
    view_markdown_path: match,
    view_excerpt: raw.slice(0, Math.max(200, maxChars)).trim()
  };
}

function resolveConfiguredModel(overrideConfig = null) {
  const stored = existsSync(sharedModelConfigPath)
    ? JSON.parse(readFileSync(sharedModelConfigPath, "utf8").replace(/^\uFEFF/, ""))
    : {};
  const merged = {
    provider: "openai-compatible",
    base_url: normalizeString(overrideConfig?.base_url || stored.base_url),
    api_key: normalizeString(overrideConfig?.api_key || stored.api_key),
    model: normalizeString(overrideConfig?.model || stored.model),
    temperature: Number(overrideConfig?.temperature ?? stored.temperature ?? 0.1),
    max_tokens: overrideConfig?.max_tokens ?? stored.max_tokens ?? null
  };
  const missing = ["base_url", "api_key", "model"].filter((key) => !merged[key]);
  if (missing.length) {
    throw new Error(`briefing 模型配置缺少必要字段：${missing.join("、")}`);
  }
  return {
    config: merged,
    source: overrideConfig ? "request_override" : "shared_local_file"
  };
}

function buildBriefingMessages({ request, profile, context }) {
  const prompt = readFileSync(promptPath, "utf8").replace(/^\uFEFF/, "");
  const profileSummary = JSON.stringify(profile, null, 2);
  const meetingContext = request.meeting_context ? JSON.stringify(request.meeting_context, null, 2) : "null";
  const interactionsText = context.interactions.length
    ? context.interactions
        .map((item, index) =>
          `${index + 1}. [${item.date}] ${item.source_title || "未命名资料"}${item.summary ? ` :: ${item.summary}` : ""}`
        )
        .join("\n")
    : "无显式 recent_interactions，需主要基于 profile 判断。";

  return [
    { role: "system", content: prompt },
    {
      role: "user",
      content: [
        `Target person: ${profile.person_name}`,
        `Conversation goal: ${request.conversation_goal}`,
        request.conversation_topic ? `Conversation topic: ${request.conversation_topic}` : null,
        request.conversation_context ? `Conversation context: ${request.conversation_context}` : null,
        request.constraints.length ? `Constraints: ${request.constraints.join(" | ")}` : null,
        "",
        "Meeting context:",
        meetingContext,
        "",
        "Recent interactions:",
        interactionsText,
        context.view_context.used_view_markdown
          ? `\nPersistent person view excerpt (${context.view_context.view_markdown_path}):\n${context.view_context.view_excerpt}`
          : "\nPersistent person view excerpt: unavailable",
        "",
        "Confirmed profile:",
        profileSummary
      ].filter(Boolean).join("\n")
    }
  ];
}

async function callOpenAICompatibleModel({ config, messages }) {
  const payload = {
    model: config.model,
    temperature: config.temperature,
    response_format: { type: "json_object" },
    messages
  };
  if (config.max_tokens != null && config.max_tokens !== "") {
    payload.max_tokens = config.max_tokens;
  }

  const response = await fetch(`${config.base_url}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.api_key}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`briefing 模型请求失败：${response.status} :: ${errorText}`);
  }
  return response.json();
}

function extractAssistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => (typeof item?.text === "string" ? item.text : "")).join("\n").trim();
  }
  throw new Error("briefing 模型没有返回可解析内容");
}

function parseJsonPayload(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("briefing 模型没有返回合法 JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeBriefingOutput({ parsed, request, profile, context, config, source }) {
  const briefing = parsed?.briefing && typeof parsed.briefing === "object" ? parsed.briefing : {};
  const relationshipRead = briefing.relationship_read && typeof briefing.relationship_read === "object"
    ? briefing.relationship_read
    : {};
  const approachStrategy = briefing.approach_strategy && typeof briefing.approach_strategy === "object"
    ? briefing.approach_strategy
    : {};
  const needsRead = briefing.needs_read && typeof briefing.needs_read === "object"
    ? briefing.needs_read
    : {};
  const attitudeIntentRead = briefing.attitude_intent_read && typeof briefing.attitude_intent_read === "object"
    ? briefing.attitude_intent_read
    : {};

  const openQuestions = Array.isArray(parsed?.open_questions)
    ? uniqueStrings(parsed.open_questions.map((item) => normalizeString(item)).filter(Boolean))
    : [];
  const status = openQuestions.length ? "needs_review" : "success";

  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    status,
    model: {
      provider: config.provider,
      base_url: config.base_url,
      model: config.model,
      temperature: config.temperature,
      source
    },
    target_person: {
      person_name: profile.person_name,
      person_ref: profile.person_ref || "",
      relationship_stage: profile.compiled_truth?.relationship_stage || "待判断",
      summary: profile.compiled_truth?.summary || ""
    },
    context_receipt: context.receipt,
    briefing: {
      quick_brief: normalizeString(briefing.quick_brief) || `${profile.person_name} 会前准备待人工确认。`,
      relationship_read: {
        current_state: normalizeString(relationshipRead.current_state) || profile.compiled_truth?.relationship_stage || "待判断",
        likely_intent: normalizeString(relationshipRead.likely_intent) || profile.compiled_truth?.intent || "待判断",
        attitude: normalizeString(relationshipRead.attitude) || profile.compiled_truth?.attitude?.label || "待判断",
        trust_level: normalizeTrustLevel(relationshipRead.trust_level)
      },
      needs_read: normalizeNeedsRead(needsRead, profile),
      issue_map: normalizeBriefingIssueMap(briefing.issue_map, profile),
      attitude_intent_read: normalizeBriefingAttitudeIntentRead(attitudeIntentRead, relationshipRead, profile),
      approach_strategy: {
        goal_translation: normalizeString(approachStrategy.goal_translation) || request.conversation_goal,
        recommended_opening: normalizeString(approachStrategy.recommended_opening) || "先从对方当前最在意的问题切入。",
        recommended_style: normalizeString(approachStrategy.recommended_style) || "务实、直接、留出判断空间",
        why_now: normalizeString(approachStrategy.why_now) || "当前输入不足，建议结合实际情境判断时机。"
      },
      talking_points: normalizeArray(briefing.talking_points, 6),
      watchouts: normalizeArray(briefing.watchouts, 5),
      questions_to_ask: normalizeArray(briefing.questions_to_ask, 6),
      next_actions: normalizeArray(briefing.next_actions, 6)
    },
    user_feedback: {
      headline: `已为 ${profile.person_name} 生成会前简报`,
      summary_lines: [
        `目标人物：${profile.person_name}`,
        `关系阶段：${profile.compiled_truth?.relationship_stage || "待判断"}`,
        "已补充隐性需求、关键议题、双方态度意图三类 briefing 洞察",
        `自动召回互动数：${context.receipt.auto_context_interaction_count}`,
        context.receipt.auto_context_used_views ? "已补充持续视图上下文" : "未命中持续视图上下文"
      ],
      next_action: {
        type: "open_briefing_markdown",
        message: "优先直接打开生成的 markdown 简报，按 1-3 分钟会前速读使用。"
      }
    },
    open_questions: openQuestions,
    notes: normalizeString(parsed?.notes)
  };
}

function normalizeNeedsRead(value, profile) {
  const source = value && typeof value === "object" ? value : {};
  const profileNeeds = normalizeLatentNeeds(profile.compiled_truth?.latent_needs);
  return {
    counterpart_needs: normalizeBriefingNeedItems(
      source.counterpart_needs || source.counterpart || profileNeeds.counterpart,
      4
    ),
    self_needs: normalizeBriefingNeedItems(
      source.self_needs || source.self || source.my_needs || profileNeeds.self,
      4
    ),
    leverage_points: normalizeArray(source.leverage_points || source.recommended_moves, 5),
    open_checks: normalizeArray(source.open_checks || source.questions_to_validate, 5)
  };
}

function normalizeBriefingNeedItems(values, limit) {
  return normalizeLatentNeeds({ counterpart: Array.isArray(values) ? values : [] })
    .counterpart
    .slice(0, limit);
}

function normalizeBriefingIssueMap(values, profile) {
  const sourceItems = Array.isArray(values) && values.length
    ? values
    : normalizeKeyIssues(profile.compiled_truth?.key_issues);
  return normalizeKeyIssues(sourceItems)
    .map((item, index) => ({
      ...item,
      suggested_move: normalizeString(sourceItems[index]?.suggested_move || sourceItems[index]?.recommended_move)
    }))
    .slice(0, 6);
}

function normalizeBriefingAttitudeIntentRead(value, relationshipRead, profile) {
  const parsed = normalizeAttitudeIntent(value);
  const profileInsight = normalizeAttitudeIntent(profile.compiled_truth?.attitude_intent);
  const fallbackCounterpart = {
    attitude: normalizeString(relationshipRead.attitude) || profile.compiled_truth?.attitude?.label || "待判断",
    intent: normalizeString(relationshipRead.likely_intent) || profile.compiled_truth?.intent || "待判断",
    evidence: [],
    confidence: "medium"
  };
  const fallbackSelf = {
    attitude: "待判断",
    intent: "待判断",
    evidence: [],
    confidence: "medium"
  };
  return {
    counterpart: chooseAttitudeIntentSide(parsed.counterpart, profileInsight.counterpart, fallbackCounterpart),
    self: chooseAttitudeIntentSide(parsed.self, profileInsight.self, fallbackSelf),
    alignment: normalizeString(value.alignment) || "待判断",
    risk: normalizeString(value.risk) || "待判断"
  };
}

function chooseAttitudeIntentSide(parsed, profileSide, fallback) {
  if (hasAttitudeIntentContent(parsed)) {
    return parsed;
  }
  if (hasAttitudeIntentContent(profileSide)) {
    return profileSide;
  }
  return fallback;
}

function writeBriefingMarkdown({ request, result, profile, context }) {
  mkdirSync(briefingsDir, { recursive: true });
  const datePart = deriveBriefingDate(request);
  const personSlug = slugify(profile.person_name || profile.person_ref || "person");
  const topicSlug = slugify(request.conversation_topic || request.meeting_context?.topic || request.conversation_goal || "briefing");
  const slug = `${datePart}-${personSlug}-${topicSlug}`;
  const filePath = path.join(briefingsDir, `${slug}.md`);
  const title = `${datePart} ${profile.person_name} 会前简报`;
  const markdown = renderBriefingMarkdown({ request, result, profile, context, title });
  writeFileSync(filePath, markdown, "utf8");
  return {
    written: true,
    path: filePath,
    title,
    slug
  };
}

function renderBriefingMarkdown({ request, result, profile, context, title }) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`- 目标人物：${profile.person_name}`);
  lines.push(`- 会话主题：${request.conversation_topic || request.meeting_context?.topic || "待补充"}`);
  lines.push(`- 会话目标：${request.conversation_goal}`);
  lines.push(`- 计划时间：${request.meeting_context?.scheduled_time || "待补充"}`);
  lines.push(`- 当前状态：${result.status}`);
  lines.push("");
  lines.push("## 15 秒速览");
  lines.push("");
  lines.push(result.briefing.quick_brief);
  lines.push("");
  lines.push("## 当前关系判断");
  lines.push("");
  lines.push(`- 关系阶段：${result.target_person.relationship_stage}`);
  lines.push(`- 当前意图：${result.briefing.relationship_read.likely_intent}`);
  lines.push(`- 当前态度：${result.briefing.relationship_read.attitude}`);
  lines.push(`- 信任度：${result.briefing.relationship_read.trust_level}`);
  lines.push("");
  appendNeedsReadSection(lines, result.briefing.needs_read);
  appendIssueMapSection(lines, result.briefing.issue_map);
  appendAttitudeIntentSection(lines, result.briefing.attitude_intent_read);
  lines.push("## 这次沟通该怎么打");
  lines.push("");
  lines.push(`- 现实目标：${result.briefing.approach_strategy.goal_translation}`);
  lines.push(`- 推荐开场：${result.briefing.approach_strategy.recommended_opening}`);
  lines.push(`- 沟通风格：${result.briefing.approach_strategy.recommended_style}`);
  lines.push(`- 为什么现在聊：${result.briefing.approach_strategy.why_now}`);
  lines.push("");
  lines.push("## 建议沟通点");
  lines.push("");
  if (result.briefing.talking_points.length) {
    result.briefing.talking_points.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push("- 待补充");
  }
  lines.push("");
  lines.push("## 建议追问");
  lines.push("");
  if (result.briefing.questions_to_ask.length) {
    result.briefing.questions_to_ask.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push("- 待补充");
  }
  lines.push("");
  lines.push("## 注意事项");
  lines.push("");
  if (result.briefing.watchouts.length) {
    result.briefing.watchouts.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push("- 待补充");
  }
  lines.push("");
  lines.push("## 会后动作");
  lines.push("");
  if (result.briefing.next_actions.length) {
    result.briefing.next_actions.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push("- 待补充");
  }
  lines.push("");
  lines.push("## 自动召回上下文");
  lines.push("");
  lines.push(`- 自动召回已开启：${context.receipt.auto_context_applied ? "是" : "否"}`);
  lines.push(`- 召回互动数：${context.receipt.auto_context_interaction_count}`);
  if (context.receipt.auto_context_used_views) {
    lines.push(`- 使用持续视图：${context.receipt.auto_context_view_path}`);
  } else {
    lines.push("- 使用持续视图：否");
  }
  lines.push("");
  if (context.interactions.length) {
    lines.push("### 最近互动");
    lines.push("");
    context.interactions.forEach((item) => {
      lines.push(`- [${item.date}] ${item.source_title || "未命名资料"}：${item.summary}`);
    });
    lines.push("");
  }
  lines.push("## 仍需人工判断");
  lines.push("");
  if (result.open_questions.length) {
    result.open_questions.forEach((item) => lines.push(`- ${item}`));
  } else {
    lines.push("- 当前无新增开放问题");
  }
  lines.push("");
  if (result.notes) {
    lines.push("## 备注");
    lines.push("");
    lines.push(result.notes);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function appendNeedsReadSection(lines, needsRead) {
  const counterpart = Array.isArray(needsRead?.counterpart_needs) ? needsRead.counterpart_needs : [];
  const self = Array.isArray(needsRead?.self_needs) ? needsRead.self_needs : [];
  const leveragePoints = Array.isArray(needsRead?.leverage_points) ? needsRead.leverage_points : [];
  const openChecks = Array.isArray(needsRead?.open_checks) ? needsRead.open_checks : [];

  if (!counterpart.length && !self.length && !leveragePoints.length && !openChecks.length) {
    return;
  }

  lines.push("## 隐性需求识别", "");
  counterpart.forEach((item) => lines.push(`- 关系人隐性需求：${formatNeedInsight(item)}`));
  self.forEach((item) => lines.push(`- 我的隐性需求：${formatNeedInsight(item)}`));
  leveragePoints.forEach((item) => lines.push(`- 可用切入点：${item}`));
  openChecks.forEach((item) => lines.push(`- 需确认：${item}`));
  lines.push("");
}

function appendIssueMapSection(lines, issueMap) {
  const items = Array.isArray(issueMap) ? issueMap : [];
  if (!items.length) {
    return;
  }

  lines.push("## 关键议题地图", "");
  items.forEach((item) => {
    const consensus = item.consensus.length ? `；共识：${item.consensus.join(" / ")}` : "";
    const nonConsensus = item.non_consensus.length ? `；非共识：${item.non_consensus.join(" / ")}` : "";
    const quotes = item.key_quotes.length ? `；关键语句：${item.key_quotes.join(" / ")}` : "";
    const move = item.suggested_move ? `；建议处理：${item.suggested_move}` : "";
    lines.push(`- ${item.issue}（${item.confidence}）${consensus}${nonConsensus}${quotes}${move}`);
  });
  lines.push("");
}

function appendAttitudeIntentSection(lines, attitudeIntentRead) {
  if (!attitudeIntentRead) {
    return;
  }

  const counterpart = attitudeIntentRead.counterpart;
  const self = attitudeIntentRead.self;
  if (!hasAttitudeIntentContent(counterpart) && !hasAttitudeIntentContent(self)) {
    return;
  }

  lines.push("## 态度与意图预判", "");
  lines.push(`- 关系人：态度=${counterpart.attitude}；意图=${counterpart.intent}；置信度=${counterpart.confidence}${formatEvidenceSuffix(counterpart.evidence)}`);
  lines.push(`- 我方：态度=${self.attitude}；意图=${self.intent}；置信度=${self.confidence}${formatEvidenceSuffix(self.evidence)}`);
  if (attitudeIntentRead.alignment && attitudeIntentRead.alignment !== "待判断") {
    lines.push(`- 对齐程度：${attitudeIntentRead.alignment}`);
  }
  if (attitudeIntentRead.risk && attitudeIntentRead.risk !== "待判断") {
    lines.push(`- 风险提醒：${attitudeIntentRead.risk}`);
  }
  lines.push("");
}

function formatNeedInsight(item) {
  return `${item.need}（${item.confidence}）${formatEvidenceSuffix(item.evidence)}`;
}

function formatEvidenceSuffix(evidence) {
  return Array.isArray(evidence) && evidence.length ? `；证据：${evidence.join(" / ")}` : "";
}

function deriveBriefingDate(request) {
  const raw = normalizeString(request.meeting_context?.scheduled_time) || new Date().toISOString().slice(0, 10);
  const matched = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (matched) {
    return matched[0];
  }
  const compact = raw.match(/\d{8}/);
  if (compact) {
    const value = compact[0];
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function persistRunArtifacts({ request, response, raw }) {
  mkdirSync(runsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = slugify(request.person_ref || request.person_name || "briefing");
  const runDirectory = path.join(runsDir, `${stamp}-${safeId}`);
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(path.join(runDirectory, "request.json"), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "response.json"), `${JSON.stringify(response, null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "raw-response.json"), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  if (response.briefing_file?.written && response.briefing_file.path && existsSync(response.briefing_file.path)) {
    const markdown = readFileSync(response.briefing_file.path, "utf8");
    writeFileSync(path.join(runDirectory, "briefing.md"), markdown, "utf8");
  }
  return runDirectory;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeArray(values, limit) {
  if (!Array.isArray(values)) {
    return [];
  }
  return uniqueStrings(values.map((item) => normalizeString(item)).filter(Boolean)).slice(0, limit);
}

function normalizeTrustLevel(value) {
  const level = normalizeString(value).toLowerCase();
  return ["high", "medium", "low"].includes(level) ? level : "medium";
}

function uniqueStrings(values) {
  return Array.from(new Set(values));
}

export const __briefing_internal = {
  validateBriefingRequest,
  resolveTargetProfile,
  deriveBriefingContext,
  normalizeBriefingOutput,
  renderBriefingMarkdown,
  writeBriefingMarkdown,
  persistRunArtifacts
};

