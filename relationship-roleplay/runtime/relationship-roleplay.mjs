// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const promptPath = path.join(skillRoot, "prompts", "relationship-roleplay.system.prompt.md");
const runsDir = path.join(__dirname, "runs");
const sharedModelConfigPath = path.resolve(
  skillRoot,
  "..",
  "relationship-ingestion",
  "runtime",
  "model-config.local.json"
);

const SKILL_NAME = "relationship-roleplay";
const SKILL_VERSION = "0.1.0";

export async function runRelationshipRoleplay(payload) {
  const request = validateRoleplayRequest(payload);
  const profile = resolveTargetProfile(request);
  const { config, source } = resolveConfiguredModel(request.model_config);
  const messages = buildRoleplayMessages({ request, profile });
  const raw = await callOpenAICompatibleModel({ config, messages });
  const assistantText = extractAssistantText(raw);
  const parsed = parseJsonPayload(assistantText);
  const result = normalizeRoleplayOutput({ parsed, request, profile, config, source });
  const runDirectory = request.options.save_run_artifacts
    ? persistRunArtifacts({ request, result, raw })
    : null;
  return {
    ...result,
    run_directory: runDirectory
  };
}

export function getRelationshipRoleplaySkillInfo() {
  return {
    name: SKILL_NAME,
    version: SKILL_VERSION,
    root: skillRoot,
    prompt_path: promptPath,
    shared_model_config_path: sharedModelConfigPath,
    runs_dir: runsDir
  };
}

function validateRoleplayRequest(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("roleplay request 必须是对象");
  }
  const conversationGoal = normalizeString(payload.conversation_goal);
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
    conversation_topic: normalizeString(payload.conversation_topic),
    scenario_context: normalizeString(payload.scenario_context),
    starting_user_message: normalizeString(payload.starting_user_message),
    constraints: Array.isArray(payload.constraints)
      ? uniqueStrings(payload.constraints.map((item) => normalizeString(item)).filter(Boolean))
      : [],
    model_config: payload.model_config && typeof payload.model_config === "object" ? payload.model_config : null,
    options: {
      save_run_artifacts: payload.options?.save_run_artifacts !== false,
      simulation_turns: clampInteger(payload.options?.simulation_turns, 3, 2, 6)
    }
  };
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

function resolveConfiguredModel(overrideConfig = null) {
  const stored = existsSync(sharedModelConfigPath)
    ? JSON.parse(readFileSync(sharedModelConfigPath, "utf8").replace(/^\uFEFF/, ""))
    : {};
  const merged = {
    provider: "openai-compatible",
    base_url: normalizeString(overrideConfig?.base_url || stored.base_url),
    api_key: normalizeString(overrideConfig?.api_key || stored.api_key),
    model: normalizeString(overrideConfig?.model || stored.model),
    temperature: Number(overrideConfig?.temperature ?? stored.temperature ?? 0.2),
    max_tokens: overrideConfig?.max_tokens ?? stored.max_tokens ?? null
  };
  const missing = ["base_url", "api_key", "model"].filter((key) => !merged[key]);
  if (missing.length) {
    throw new Error(`roleplay 模型配置缺少必要字段：${missing.join("、")}`);
  }
  return {
    config: merged,
    source: overrideConfig ? "request_override" : "shared_local_file"
  };
}

function buildRoleplayMessages({ request, profile }) {
  const prompt = readFileSync(promptPath, "utf8").replace(/^\uFEFF/, "");
  const profileSummary = JSON.stringify(profile, null, 2);
  return [
    { role: "system", content: prompt },
    {
      role: "user",
      content: [
        `Target person: ${profile.person_name}`,
        `Conversation goal: ${request.conversation_goal}`,
        request.conversation_topic ? `Conversation topic: ${request.conversation_topic}` : null,
        request.scenario_context ? `Scenario context: ${request.scenario_context}` : null,
        request.starting_user_message ? `Starting user message: ${request.starting_user_message}` : null,
        request.constraints.length ? `Constraints: ${request.constraints.join(" | ")}` : null,
        `Simulation turns: ${request.options.simulation_turns}`,
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
    throw new Error(`roleplay 模型请求失败：${response.status} :: ${errorText}`);
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
  throw new Error("roleplay 模型没有返回可解析内容");
}

function parseJsonPayload(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("roleplay 模型没有返回合法 JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeRoleplayOutput({ parsed, request, profile, config, source }) {
  const simulation = parsed?.simulation && typeof parsed.simulation === "object" ? parsed.simulation : {};
  const personaRead = simulation.persona_read && typeof simulation.persona_read === "object"
    ? simulation.persona_read
    : {};
  const coachFeedback = parsed?.coach_feedback && typeof parsed.coach_feedback === "object"
    ? parsed.coach_feedback
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
    simulation: {
      persona_read: {
        current_state: normalizeString(personaRead.current_state) || profile.compiled_truth?.relationship_stage || "待判断",
        likely_intent: normalizeString(personaRead.likely_intent) || profile.compiled_truth?.intent || "待判断",
        attitude: normalizeString(personaRead.attitude) || profile.compiled_truth?.attitude?.label || "待判断",
        response_style: normalizeString(personaRead.response_style) || "谨慎、克制、优先基于事实回应"
      },
      opening_assessment: normalizeString(simulation.opening_assessment) || "建议先用低压力开场，先听判断，再谈推进条件。",
      simulated_turns: normalizeTurns(simulation.simulated_turns, request.options.simulation_turns, request.starting_user_message),
      likely_pushbacks: normalizeArray(simulation.likely_pushbacks, 6),
      recommended_replies: normalizeArray(simulation.recommended_replies, 6),
      danger_zones: normalizeArray(simulation.danger_zones, 6),
      if_conversation_goes_well: normalizeArray(simulation.if_conversation_goes_well, 6)
    },
    coach_feedback: {
      keep_doing: normalizeArray(coachFeedback.keep_doing, 6),
      avoid: normalizeArray(coachFeedback.avoid, 6),
      recovery_moves: normalizeArray(coachFeedback.recovery_moves, 6)
    },
    open_questions: openQuestions,
    notes: normalizeString(parsed?.notes)
  };
}

function normalizeTurns(turns, requestedCount, startingUserMessage) {
  if (!Array.isArray(turns) || !turns.length) {
    return [
      {
        turn: 1,
        user_move: startingUserMessage || "先低压力地确认对方当前真实判断。",
        likely_response: "当前资料不足，建议先用一轮真实对话补足。"
      }
    ];
  }
  return turns
    .slice(0, requestedCount)
    .map((item, index) => ({
      turn: clampInteger(item?.turn, index + 1, 1, 99),
      user_move: normalizeString(item?.user_move) || (index === 0 && startingUserMessage) || "待补充",
      likely_response: normalizeString(item?.likely_response) || "待补充",
      why: normalizeString(item?.why),
      risk_level: normalizeRiskLevel(item?.risk_level)
    }));
}

function persistRunArtifacts({ request, result, raw }) {
  mkdirSync(runsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = (request.person_ref || request.person_name || "roleplay").replace(/[^a-zA-Z0-9-_]/g, "-");
  const runDirectory = path.join(runsDir, `${stamp}-${safeId}`);
  mkdirSync(runDirectory, { recursive: true });
  writeFileSync(path.join(runDirectory, "request.json"), `${JSON.stringify(request, null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "response.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "raw-response.json"), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
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

function normalizeRiskLevel(value) {
  const level = normalizeString(value).toLowerCase();
  return ["low", "medium", "high"].includes(level) ? level : "medium";
}

function uniqueStrings(values) {
  return Array.from(new Set(values));
}

function clampInteger(value, fallback, min, max) {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(candidate)));
}

export const __roleplay_internal = {
  validateRoleplayRequest,
  resolveTargetProfile,
  normalizeRoleplayOutput,
  persistRunArtifacts
};

