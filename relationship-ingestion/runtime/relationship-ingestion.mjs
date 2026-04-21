// SPDX-License-Identifier: Apache-2.0
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const skillRoot = path.resolve(__dirname, "..");
const promptPath = path.join(skillRoot, "prompts", "relationship-ingestion.system.prompt.md");
const modelConfigPath = path.join(__dirname, "model-config.local.json");
const runsDir = path.join(__dirname, "runs");

const SKILL_NAME = "relationship-ingestion";
const SKILL_VERSION = "0.1.0";
const DEFAULT_OPTIONS = {
  max_total_excerpt_chars: 40000,
  max_excerpt_chars: 1200,
  max_excerpt_count: 24,
  save_run_artifacts: true,
  require_evidence: true
};
const PERSON_PLACEHOLDER_NAMES = new Set([
  "我",
  "你",
  "他",
  "她",
  "它",
  "我们",
  "你们",
  "他们",
  "她们",
  "大家",
  "对方",
  "同事",
  "领导",
  "老板",
  "老师",
  "公司",
  "平台",
  "团队",
  "项目",
  "客户",
  "用户",
  "别人",
  "其他人",
  "某人",
  "未知"
]);
const PLACEHOLDER_VALUES = new Set([
  "待判断",
  "待确认",
  "未知",
  "暂无",
  "无",
  "没有",
  "none",
  "n/a",
  "na",
  "null"
]);

export function getRelationshipIngestionSkillInfo() {
  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    skill_root: skillRoot,
    prompt_path: promptPath,
    model_config_path: modelConfigPath,
    runs_dir: runsDir
  };
}

export function getPublicModelConfig(fallbackConfig = {}) {
  const { config, source } = resolveConfiguredModel({ fallbackConfig, allowMissing: true });
  return {
    configured: Boolean(config.api_key && config.base_url && config.model),
    source,
    provider: config.provider || "openai-compatible",
    base_url: config.base_url || "",
    model: config.model || "",
    temperature: config.temperature ?? 0.1,
    max_tokens: config.max_tokens ?? null,
    api_key_masked: maskApiKey(config.api_key || "")
  };
}

export function saveModelConfig(inputConfig, fallbackConfig = {}) {
  const validated = validateModelConfig(inputConfig, { requireSecrets: true });
  ensureDirectory(path.dirname(modelConfigPath));
  writeFileSync(modelConfigPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return getPublicModelConfig(fallbackConfig);
}

export function buildLegacyBulkRequest(body) {
  const targets = Array.isArray(body?.targets) ? body.targets : [];
  const focusPeople = Array.isArray(body?.focusPeople) ? body.focusPeople : targets;
  const existingPeople = Array.isArray(body?.existingPeople) ? body.existingPeople : [];
  const uploadedFiles = Array.isArray(body?.uploadedFiles) ? body.uploadedFiles : [];
  const materials = String(body?.materials || "").trim();
  const focusInstruction = String(body?.focusInstruction || "").trim();

  return {
    request_id: body?.requestId || null,
    goal: "从导入资料中识别值得建立或更新的人物档案，并提炼后续跟进建议",
    target_people: targets,
    focus_people: focusPeople,
    focus_instruction: focusInstruction,
    existing_people: existingPeople.map((person) => ({
      person_id: person?.id || person?.person_id || null,
      name: person?.name || "",
      aliases: Array.isArray(person?.aliases) ? person.aliases : [],
      tags: Array.isArray(person?.tags) ? person.tags : [],
      summary: person?.summary || person?.bio || ""
    })),
    sources: [
      {
        source_id: "legacy-bulk-materials",
        title: "批量整理资料",
        source_type: "note",
        channel: "legacy-bulk-import",
        relative_path: uploadedFiles.map((file) => file.relativePath || file.name).filter(Boolean).join(" | "),
        content: materials,
        metadata: {
          uploaded_files: uploadedFiles
        }
      }
    ],
    options: {
      save_run_artifacts: true,
      require_evidence: true
    }
  };
}

export async function runRelationshipIngestion(payload, fallbackConfig = {}) {
  const request = validateRelationshipIngestionRequest(payload);
  const policy = deriveIngestionPolicy(request);
  const { config, source } = resolveConfiguredModel({
    fallbackConfig,
    overrideConfig: request.model_config,
    allowMissing: false
  });
  const attemptPlans = buildAttemptPlansForPolicy(request.options, policy);
  const failures = [];

  for (const attempt of attemptPlans) {
    const attemptRequest = {
      ...request,
      options: {
        ...request.options,
        max_total_excerpt_chars: attempt.max_total_excerpt_chars,
        max_excerpt_chars: attempt.max_excerpt_chars,
        max_excerpt_count: attempt.max_excerpt_count
      }
    };
    const prepared = prepareSourcesAndExcerpts(attemptRequest, policy);
    const messages = buildRelationshipIngestionMessagesWithPolicy({ request: attemptRequest, prepared, policy });
    let raw = null;

    try {
      raw = await callOpenAICompatibleModel({ config, messages });
      const assistantText = extractAssistantText(raw);
      const parsed = parseJsonPayload(assistantText);
      const result = normalizeRelationshipIngestionOutput({
        parsed,
        request: attemptRequest,
        prepared,
        policy,
        modelConfig: config,
        configSource: source
      });
      result.execution = {
        attempt_label: attempt.label,
        attempt_index: attempt.index,
        attempts_total: attemptPlans.length,
        used_excerpt_count: prepared.truncation.used_excerpt_count,
        dropped_excerpt_count: prepared.truncation.dropped_excerpt_count,
        max_total_excerpt_chars: attempt.max_total_excerpt_chars,
        max_excerpt_chars: attempt.max_excerpt_chars,
        policy_key: policy.policy_key
      };
      const runDirectory = request.options.save_run_artifacts
        ? persistRunArtifacts({ request: attachDerivedPolicy(attemptRequest, policy), result, raw })
        : null;

      return {
        ...result,
        run_directory: runDirectory
      };
    } catch (error) {
      failures.push(
        buildFailureRecord({
          attempt,
          prepared,
          raw,
          error
        })
      );
    }
  }

  const lastFailure = failures.at(-1);
  const runDirectory = request.options.save_run_artifacts
    ? persistFailedRunArtifacts({ request: attachDerivedPolicy(request, policy), failures })
    : null;
  throw createHttpError(lastFailure?.statusCode || 502, lastFailure?.message || "relationship-ingestion 执行失败。", {
    ...(lastFailure?.details || {}),
    attempts: failures,
    run_directory: runDirectory
  });
}

function validateRelationshipIngestionRequest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createHttpError(400, "relationship-ingestion 请求体必须是 JSON 对象。");
  }

  const sources = Array.isArray(payload.sources)
    ? payload.sources.map((source, index) => normalizeSource(source, index)).filter((source) => source.content)
    : [];

  if (!sources.length) {
    throw createHttpError(400, "至少需要提供一条可解析的 source。");
  }

  const targetPeople = normalizeStringArray(payload.target_people ?? payload.targetPeople);
  const focusPeople = normalizeStringArray(
    payload.focus_people ?? payload.focusPeople ?? payload.priority_people ?? payload.priorityPeople
  );
  const mergedTargetPeople = uniqueStrings([...targetPeople, ...focusPeople]);
  const normalizedFocusPeople = focusPeople.length ? focusPeople : mergedTargetPeople;

  return {
    request_id: normalizeOptionalString(payload.request_id) || buildRequestId(),
    goal: normalizeOptionalString(payload.goal) || "从资料中识别值得建立或更新的人物档案，并提炼后续跟进建议",
    target_people: mergedTargetPeople,
    focus_people: normalizedFocusPeople,
    focus_instruction: normalizeOptionalString(
      payload.focus_instruction ?? payload.focusInstruction ?? payload.priority_instruction ?? payload.priorityInstruction
    ),
    existing_people: normalizeExistingPeople(payload.existing_people),
    sources,
    options: normalizeOptions(payload.options),
    model_config: payload.model_config ? validateModelConfig(payload.model_config, { requireSecrets: true }) : null
  };
}

function normalizeSource(source, index) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {
      source_id: `source-${index + 1}`,
      source_type: "text",
      title: `未命名资料 ${index + 1}`,
      channel: "",
      relative_path: "",
      content: "",
      metadata: {}
    };
  }

  return {
    source_id: normalizeOptionalString(source.source_id) || `source-${index + 1}`,
    source_type: normalizeOptionalString(source.source_type) || "text",
    title: normalizeOptionalString(source.title) || `未命名资料 ${index + 1}`,
    channel: normalizeOptionalString(source.channel) || "",
    relative_path: normalizeOptionalString(source.relative_path) || "",
    content: String(source.content || source.extracted_text || "").trim(),
    captured_at: normalizeOptionalString(source.captured_at) || "",
    metadata: source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata) ? source.metadata : {}
  };
}

function normalizeExistingPeople(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((person) => {
      const name = normalizeOptionalString(person?.name) || "";
      return {
        person_id: normalizeOptionalString(person?.person_id || person?.id) || null,
        name,
        aliases: normalizePersonAliases(person?.aliases, name),
        tags: normalizeStringArray(person?.tags),
        summary: normalizeOptionalString(person?.summary) || ""
      };
    })
    .filter((person) => person.name);
}

function normalizeOptions(options) {
  const next = { ...DEFAULT_OPTIONS };
  if (options && typeof options === "object" && !Array.isArray(options)) {
    if (Number.isFinite(Number(options.max_total_excerpt_chars))) {
      next.max_total_excerpt_chars = Math.max(2000, Math.trunc(Number(options.max_total_excerpt_chars)));
    }
    if (Number.isFinite(Number(options.max_excerpt_chars))) {
      next.max_excerpt_chars = Math.max(200, Math.trunc(Number(options.max_excerpt_chars)));
    }
    if (Number.isFinite(Number(options.max_excerpt_count))) {
      next.max_excerpt_count = Math.max(1, Math.trunc(Number(options.max_excerpt_count)));
    }
    if (typeof options.save_run_artifacts === "boolean") {
      next.save_run_artifacts = options.save_run_artifacts;
    }
    if (typeof options.require_evidence === "boolean") {
      next.require_evidence = options.require_evidence;
    }
  }
  return next;
}

function deriveIngestionPolicy(request) {
  const sourceCount = request.sources.length;
  const totalChars = request.sources.reduce((sum, source) => sum + String(source?.content || "").length, 0);
  const averageCharsPerSource = sourceCount ? Math.round(totalChars / sourceCount) : 0;
  const hasExistingPeople = request.existing_people.length > 0;
  const hasFocusPeople = request.focus_people.length > 0;
  const hasTargetPeople = request.target_people.length > 0;
  const input_handling = sourceCount > 1 || totalChars > 16000 ? "batch" : "single";
  const context_profile = hasExistingPeople ? "existing_context" : "cold_start";
  const source_density =
    totalChars > 30000 || sourceCount > 6 ? "heavy" : totalChars > 10000 || sourceCount > 2 ? "medium" : "light";

  let policy_key = "balanced-default";
  let excerpt_strategy = "balanced";
  let resolution_strategy = "balanced_match_and_discover";
  let latency_tier = "balanced";

  if (input_handling === "single" && hasExistingPeople && hasFocusPeople) {
    policy_key = "single-focused-update";
    excerpt_strategy = "focused_fast";
    resolution_strategy = "prefer_match_existing";
    latency_tier = "fast";
  } else if (input_handling === "single" && hasExistingPeople) {
    policy_key = "single-update";
    excerpt_strategy = "balanced_single";
    resolution_strategy = "prefer_match_existing";
    latency_tier = "balanced";
  } else if (input_handling === "single") {
    policy_key = "single-cold-start";
    excerpt_strategy = "balanced_single";
    resolution_strategy = "discover_with_review";
    latency_tier = "balanced";
  } else if (input_handling === "batch" && !hasExistingPeople) {
    policy_key = "batch-cold-start";
    excerpt_strategy = "broad_recall";
    resolution_strategy = "discover_with_review";
    latency_tier = "deep";
  } else if (input_handling === "batch" && hasFocusPeople) {
    policy_key = "batch-refresh-focused";
    excerpt_strategy = "broad_focus";
    resolution_strategy = "balanced_match_and_discover";
    latency_tier = "deep";
  } else {
    policy_key = "batch-refresh";
    excerpt_strategy = "balanced";
    resolution_strategy = "balanced_match_and_discover";
    latency_tier = "balanced";
  }

  return {
    policy_key,
    input_handling,
    context_profile,
    source_density,
    excerpt_strategy,
    resolution_strategy,
    latency_tier,
    prefer_existing_match: resolution_strategy === "prefer_match_existing",
    emphasize_focus_people: hasFocusPeople,
    require_focus_coverage_review: hasFocusPeople,
    promote_mentioned_candidates: input_handling === "single" || hasTargetPeople,
    source_priority_enabled: hasFocusPeople || hasTargetPeople || hasExistingPeople,
    metrics: {
      source_count: sourceCount,
      total_chars: totalChars,
      average_chars_per_source: averageCharsPerSource,
      focus_people_count: request.focus_people.length,
      target_people_count: request.target_people.length,
      existing_people_count: request.existing_people.length
    }
  };
}

function validateModelConfig(config, { requireSecrets = true } = {}) {
  const normalized = normalizeModelConfigFields(config);
  const missing = [];

  if (!normalized.provider) {
    normalized.provider = "openai-compatible";
  }
  if (normalized.provider !== "openai-compatible") {
    throw createHttpError(400, "当前仅支持 openai-compatible 协议。");
  }

  if (!normalized.base_url) {
    missing.push("base_url");
  } else {
    try {
      const url = new URL(normalized.base_url);
      normalized.base_url = url.toString().replace(/\/+$/, "");
    } catch {
      throw createHttpError(400, "model_config.base_url 不是合法 URL。");
    }
  }

  if (!normalized.model) {
    missing.push("model");
  }
  if (requireSecrets && !normalized.api_key) {
    missing.push("api_key");
  }
  if (missing.length) {
    throw createHttpError(400, `模型配置缺少必要字段：${missing.join("、")}`);
  }

  if (normalized.temperature == null) {
    normalized.temperature = 0.1;
  } else if (!Number.isFinite(Number(normalized.temperature))) {
    throw createHttpError(400, "model_config.temperature 必须是数字。");
  } else {
    normalized.temperature = Number(normalized.temperature);
  }

  if (normalized.max_tokens != null) {
    if (!Number.isFinite(Number(normalized.max_tokens))) {
      throw createHttpError(400, "model_config.max_tokens 必须是整数。");
    }
    normalized.max_tokens = Math.max(128, Math.trunc(Number(normalized.max_tokens)));
  }

  return normalized;
}

function normalizeModelConfigFields(input) {
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const maxTokensValue = value.max_tokens ?? value.maxTokens ?? null;
  return {
    provider: normalizeOptionalString(value.provider) || "openai-compatible",
    base_url: normalizeOptionalString(value.base_url || value.baseUrl) || "",
    api_key: normalizeOptionalString(value.api_key || value.apiKey) || "",
    model: normalizeOptionalString(value.model) || "",
    temperature: value.temperature,
    max_tokens: maxTokensValue === "" ? null : maxTokensValue
  };
}

function resolveConfiguredModel({ fallbackConfig = {}, overrideConfig = null, allowMissing = false }) {
  const fallback = normalizeModelConfigFields({
    provider: "openai-compatible",
    base_url: fallbackConfig.baseUrl,
    api_key: fallbackConfig.apiKey,
    model: fallbackConfig.model,
    temperature: fallbackConfig.temperature,
    max_tokens: fallbackConfig.maxTokens
  });
  const stored = loadStoredModelConfig();
  const merged = {
    ...fallback,
    ...(stored || {}),
    ...(overrideConfig || {})
  };

  if (allowMissing) {
    return {
      config: {
        provider: merged.provider || "openai-compatible",
        base_url: merged.base_url || "",
        api_key: merged.api_key || "",
        model: merged.model || "",
        temperature: merged.temperature ?? 0.1,
        max_tokens: merged.max_tokens ?? null
      },
      source: overrideConfig ? "request_override" : stored ? "local_file" : "env_fallback"
    };
  }

  return {
    config: validateModelConfig(merged, { requireSecrets: true }),
    source: overrideConfig ? "request_override" : stored ? "local_file" : "env_fallback"
  };
}

function loadStoredModelConfig() {
  if (!existsSync(modelConfigPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(modelConfigPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw createHttpError(500, "本地模型配置文件损坏，无法读取。", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function prepareSourcesAndExcerpts(request, policy) {
  const excerpts = [];
  let usedChars = 0;
  let totalBlocks = 0;
  const orderedSources = orderSourcesForPolicy(request.sources, request, policy);

  for (const source of orderedSources) {
    const blocks = splitIntoExcerptBlocks(source.content, request.options.max_excerpt_chars);
    const orderedBlocks = orderExcerptBlocksForPolicy(blocks, source, request, policy);
    totalBlocks += blocks.length;

    for (const block of orderedBlocks) {
      if (excerpts.length >= request.options.max_excerpt_count) {
        break;
      }
      if (excerpts.length && usedChars + block.length > request.options.max_total_excerpt_chars) {
        break;
      }
      excerpts.push({
        excerpt_index: excerpts.length + 1,
        excerpt_id: `excerpt-${excerpts.length + 1}`,
        source_id: source.source_id,
        source_title: source.title,
        source_relative_path: source.relative_path || "",
        source_captured_at: source.captured_at || "",
        text: block
      });
      usedChars += block.length;
    }
  }

  if (!excerpts.length) {
    throw createHttpError(400, "导入资料中没有可用于抽取的文本内容。");
  }

  return {
    excerpts,
    truncation: {
      total_excerpt_count: totalBlocks,
      used_excerpt_count: excerpts.length,
      dropped_excerpt_count: Math.max(0, totalBlocks - excerpts.length),
      excerpt_count_limit: request.options.max_excerpt_count
    },
    source_ordering: {
      prioritized: policy?.source_priority_enabled || false,
      ordered_source_ids: orderedSources.map((source) => source.source_id)
    }
  };
}

function orderSourcesForPolicy(sources, request, policy) {
  if (!Array.isArray(sources) || !sources.length) {
    return [];
  }
  if (!policy?.source_priority_enabled) {
    return sources.slice();
  }

  return sources
    .map((source, index) => ({
      source,
      index,
      score: scoreSourceForPolicy(source, request, policy)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((item) => item.source);
}

function scoreSourceForPolicy(source, request, policy) {
  const haystack = [
    normalizeOptionalString(source?.title),
    normalizeOptionalString(source?.relative_path),
    String(source?.content || "").slice(0, 4000)
  ]
    .filter(Boolean)
    .join("\n");
  const targets = uniqueStrings([...(request.focus_people || []), ...(request.target_people || [])])
    .map((name) => normalizePersonName(name))
    .filter(Boolean);
  const existingNames = (request.existing_people || [])
    .flatMap((person) => [person?.name, ...(Array.isArray(person?.aliases) ? person.aliases : [])])
    .map((name) => normalizePersonName(name))
    .filter(Boolean);

  let score = 0;
  targets.forEach((name) => {
    if (name && haystack.includes(name)) {
      score += policy.emphasize_focus_people ? 8 : 5;
    }
  });
  existingNames.forEach((name) => {
    if (name && haystack.includes(name)) {
      score += 2;
    }
  });
  if (policy.input_handling === "single") {
    score += 1;
  }
  return score;
}

function splitIntoExcerptBlocks(content, maxExcerptChars) {
  const normalized = String(content || "")
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks = [];

  for (const block of normalized) {
    if (block.length <= maxExcerptChars) {
      chunks.push(block);
      continue;
    }

    let cursor = 0;
    while (cursor < block.length) {
      chunks.push(block.slice(cursor, cursor + maxExcerptChars).trim());
      cursor += maxExcerptChars;
    }
  }

  return chunks.filter(Boolean);
}

function orderExcerptBlocksForPolicy(blocks, source, request, policy) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return [];
  }
  if (!policy?.source_priority_enabled) {
    return blocks.slice();
  }

  return blocks
    .map((block, index) => ({
      block,
      index,
      score: scoreExcerptBlockForPolicy(block, source, request, policy)
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((item) => item.block);
}

function scoreExcerptBlockForPolicy(block, source, request, policy) {
  const haystack = [
    normalizeOptionalString(source?.title),
    normalizeOptionalString(source?.relative_path),
    String(block || "")
  ]
    .filter(Boolean)
    .join("\n");

  const focusNames = normalizeStringArray(request.focus_people).map((name) => normalizePersonName(name)).filter(Boolean);
  const targetNames = normalizeStringArray(request.target_people).map((name) => normalizePersonName(name)).filter(Boolean);
  const existingNames = (request.existing_people || [])
    .flatMap((person) => [person?.name, ...(Array.isArray(person?.aliases) ? person.aliases : [])])
    .map((name) => normalizePersonName(name))
    .filter(Boolean);

  let score = 0;

  focusNames.forEach((name) => {
    if (name && haystack.includes(name)) {
      score += 16;
    }
  });
  targetNames.forEach((name) => {
    if (name && haystack.includes(name)) {
      score += 10;
    }
  });
  existingNames.forEach((name) => {
    if (name && haystack.includes(name)) {
      score += 4;
    }
  });

  if (/说话人|发言|人物|待办|负责人|跟进|同步|共识|结论/.test(haystack)) {
    score += 6;
  }
  if (/话题维度|背景介绍|方案背景/.test(haystack)) {
    score -= 2;
  }
  if (policy?.input_handling === "single") {
    score += 1;
  }

  return score;
}

async function callOpenAICompatibleModel({ config, messages }) {
  const payload = {
    model: config.model,
    temperature: config.temperature,
    messages,
    response_format: {
      type: "json_object"
    }
  };
  if (config.max_tokens != null) {
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
    throw createHttpError(502, `大模型请求失败：${response.status}`, {
      response: errorText
    });
  }

  return response.json();
}

function buildRelationshipIngestionMessagesWithPolicy({ request, prepared, policy }) {
  const prompt = readTextFile(promptPath);
  const excerptLines = prepared.excerpts
    .map((excerpt) => `${excerpt.excerpt_index}. [${excerpt.source_title}] ${excerpt.text}`)
    .join("\n\n");
  const policyLines = buildPolicyPromptLines(policy, prepared);
  const existingPeopleLines = formatExistingPeopleForPrompt(request.existing_people);

  return [
    { role: "system", content: prompt },
    {
      role: "user",
      content: [
        `Goal: ${request.goal}`,
        `Focus people: ${
          request.focus_people.length
            ? request.focus_people.join(", ")
            : request.target_people.length
              ? request.target_people.join(", ")
              : "auto-detect high-value people from the materials"
        }`,
        request.focus_instruction ? `Focus instruction: ${request.focus_instruction}` : null,
        `Existing people: ${
          request.existing_people.length ? request.existing_people.map((person) => person.name).join(", ") : "none"
        }`,
        existingPeopleLines.length ? "Existing people directory:" : null,
        ...existingPeopleLines,
        `Source count: ${request.sources.length}`,
        `Used excerpts: ${prepared.truncation.used_excerpt_count}`,
        prepared.truncation.dropped_excerpt_count > 0
          ? `Dropped excerpts: ${prepared.truncation.dropped_excerpt_count}`
          : "Dropped excerpts: 0",
        "",
        "Internal execution policy:",
        ...policyLines,
        "",
        "Source materials:",
        excerptLines
      ].filter(Boolean).join("\n")
    }
  ];
}

function formatExistingPeopleForPrompt(existingPeople) {
  if (!Array.isArray(existingPeople) || existingPeople.length === 0) {
    return [];
  }

  return existingPeople.slice(0, 24).map((person) => {
    const aliases = normalizePersonAliases(person.aliases, person.name);
    const tags = normalizeProfileItems(person.tags, { maxLength: 24 }).slice(0, 4);
    const summary = truncate(person.summary || "", 72);
    return [
      `- canonical_name: ${person.name}`,
      aliases.length ? `aliases: ${aliases.join(" / ")}` : "aliases: none",
      tags.length ? `tags: ${tags.join(" / ")}` : "tags: none",
      summary ? `summary: ${summary}` : "summary: none"
    ].join(" | ");
  });
}

function buildPolicyPromptLines(policy, prepared) {
  if (!policy) {
    return ["- policy_key: balanced-default"];
  }

  return [
    `- policy_key: ${policy.policy_key}`,
    `- input_handling: ${policy.input_handling}`,
    `- context_profile: ${policy.context_profile}`,
    `- excerpt_strategy: ${policy.excerpt_strategy}`,
    `- resolution_strategy: ${policy.resolution_strategy}`,
    `- latency_tier: ${policy.latency_tier}`,
    policy.prefer_existing_match
      ? "- prioritize updating existing entities before creating new ones"
      : "- allow discovery of new entity candidates when evidence is stable",
    policy.promote_mentioned_candidates
      ? "- repeated named stakeholders can be kept as review candidates even if they are not primary speakers"
      : "- keep the output focused on primary participants with stable evidence",
    policy.require_focus_coverage_review
      ? "- if a focus person is not recovered, add a review warning instead of silently dropping it"
      : "- no forced focus coverage review",
    prepared?.source_ordering?.prioritized
      ? `- prioritized_sources: ${prepared.source_ordering.ordered_source_ids.join(", ")}`
      : "- prioritized_sources: disabled"
  ];
}

function buildAttemptPlansForPolicy(options, policy) {
  const strategy = resolveAttemptStrategy(policy);
  const adjustedOptions = {
    max_total_excerpt_chars: Math.max(4000, Math.trunc(options.max_total_excerpt_chars * strategy.base_total_factor)),
    max_excerpt_chars: Math.max(400, Math.trunc(options.max_excerpt_chars * strategy.base_excerpt_factor)),
    max_excerpt_count: Math.max(3, Math.trunc(options.max_excerpt_count * strategy.base_count_factor))
  };

  return strategy.plans.map((plan, index) => ({
    index: index + 1,
    label: plan.label,
    max_total_excerpt_chars: Math.max(4000, Math.trunc(adjustedOptions.max_total_excerpt_chars * plan.totalFactor)),
    max_excerpt_chars: Math.max(400, Math.trunc(adjustedOptions.max_excerpt_chars * plan.excerptFactor)),
    max_excerpt_count: Math.max(3, Math.trunc(adjustedOptions.max_excerpt_count * plan.excerptCountFactor))
  }));
}

function resolveAttemptStrategy(policy) {
  switch (policy?.excerpt_strategy) {
    case "focused_fast":
      return {
        base_total_factor: 0.78,
        base_excerpt_factor: 0.95,
        base_count_factor: 0.34,
        plans: [
          { label: "primary", totalFactor: 1, excerptFactor: 1, excerptCountFactor: 1 },
          { label: "compact", totalFactor: 0.8, excerptFactor: 0.88, excerptCountFactor: 0.75 }
        ]
      };
    case "balanced_single":
      return {
        base_total_factor: 0.9,
        base_excerpt_factor: 0.95,
        base_count_factor: 0.62,
        plans: [
          { label: "primary", totalFactor: 1, excerptFactor: 1, excerptCountFactor: 1 },
          { label: "compact", totalFactor: 0.75, excerptFactor: 0.85, excerptCountFactor: 0.78 },
          { label: "focused", totalFactor: 0.55, excerptFactor: 0.7, excerptCountFactor: 0.58 }
        ]
      };
    case "broad_recall":
      return {
        base_total_factor: 1.15,
        base_excerpt_factor: 0.8,
        base_count_factor: 1.1,
        plans: [
          { label: "primary", totalFactor: 1, excerptFactor: 1, excerptCountFactor: 1 },
          { label: "compact", totalFactor: 0.82, excerptFactor: 0.82, excerptCountFactor: 0.86 },
          { label: "focused", totalFactor: 0.62, excerptFactor: 0.68, excerptCountFactor: 0.7 }
        ]
      };
    case "broad_focus":
      return {
        base_total_factor: 1.05,
        base_excerpt_factor: 0.85,
        base_count_factor: 0.86,
        plans: [
          { label: "primary", totalFactor: 1, excerptFactor: 1, excerptCountFactor: 1 },
          { label: "compact", totalFactor: 0.8, excerptFactor: 0.84, excerptCountFactor: 0.8 },
          { label: "focused", totalFactor: 0.58, excerptFactor: 0.7, excerptCountFactor: 0.62 }
        ]
      };
    default:
      return {
        base_total_factor: 1,
        base_excerpt_factor: 1,
        base_count_factor: 1,
        plans: [
          { label: "primary", totalFactor: 1, excerptFactor: 1, excerptCountFactor: 1 },
          { label: "compact", totalFactor: 0.72, excerptFactor: 0.8, excerptCountFactor: 0.8 },
          { label: "focused", totalFactor: 0.5, excerptFactor: 0.65, excerptCountFactor: 0.6 }
        ]
      };
  }
}

function buildFailureRecord({ attempt, prepared, raw, error }) {
  return {
    attempt_label: attempt.label,
    attempt_index: attempt.index,
    statusCode: error?.statusCode || 502,
    message: error?.message || "模型调用失败。",
    details: error?.details || {},
    used_excerpt_count: prepared.truncation.used_excerpt_count,
    dropped_excerpt_count: prepared.truncation.dropped_excerpt_count,
    max_total_excerpt_chars: attempt.max_total_excerpt_chars,
    max_excerpt_chars: attempt.max_excerpt_chars,
    max_excerpt_count: attempt.max_excerpt_count,
    raw_response_preview: raw ? truncate(JSON.stringify(raw), 1200) : ""
  };
}

function normalizeRelationshipIngestionOutput({ parsed, request, prepared, policy, modelConfig, configSource }) {
  const people = Array.isArray(parsed.people) ? parsed.people : [];
  const existingLookup = buildExistingPersonLookup(request.existing_people);
  const evidenceIndexSet = new Set();
  const normalizationIssues = [];

  const detectedPeople = people
    .map((person) => normalizeDetectedPerson(person, prepared.excerpts, evidenceIndexSet, normalizationIssues))
    .filter(Boolean);
  const resolvedPeople = people
    .map((person) => normalizeResolvedPerson(person, request.existing_people, existingLookup, policy, normalizationIssues))
    .filter(Boolean);
  const profileUpdates = people
    .map((person) =>
      normalizeProfileUpdate(
        person,
        request.existing_people,
        existingLookup,
        policy,
        prepared.excerpts,
        evidenceIndexSet,
        normalizationIssues
      )
    )
    .filter(Boolean);
  const relationshipEdges = normalizeRelationshipEdges(parsed.relationship_edges, prepared.excerpts, evidenceIndexSet);
  const todos = normalizeTodos(people, prepared.excerpts, evidenceIndexSet);
  const evidence = buildEvidenceCatalog(prepared.excerpts, evidenceIndexSet);
  const reviewFlags = normalizeReviewFlags({
    modelFlags: parsed.review_flags,
    detectedPeople,
    prepared,
    request,
    normalizationIssues
  });
  const personProfiles = buildPersonProfiles({
    profileUpdates,
    resolvedPeople,
    detectedPeople,
    todos,
    excerpts: prepared.excerpts,
    interactionSummary: normalizeInteractionSummary(parsed.interaction_summary),
    reviewFlags
  });
  const reviewBundle = buildReviewBundle({
    request,
    prepared,
    policy,
    detectedPeople,
    resolvedPeople,
    profileUpdates,
    personProfiles,
    reviewFlags
  });
  const profileTierLookup = new Map(personProfiles.map((profile) => [profile.person_name, profile.profile_tier]));
  const status =
    reviewFlags.some((flag) => flag.level === "warning" || flag.level === "critical") ||
    resolvedPeople.some((item) => item.resolution_action === "review") ||
    reviewBundle.required_candidate_count > 0 ||
    !detectedPeople.length
    ? "needs_review"
    : "success";

  return {
    skill: SKILL_NAME,
    version: SKILL_VERSION,
    status,
    source: "llm",
    source_label: `大模型抽取 / ${modelConfig.model}`,
    model: {
      provider: modelConfig.provider,
      base_url: modelConfig.base_url,
      model: modelConfig.model,
      temperature: modelConfig.temperature,
      configured: true,
      source: configSource
    },
    policy: {
      policy_key: policy?.policy_key || "balanced-default",
      input_handling: policy?.input_handling || "single",
      context_profile: policy?.context_profile || "cold_start",
      source_density: policy?.source_density || "light",
      excerpt_strategy: policy?.excerpt_strategy || "balanced",
      resolution_strategy: policy?.resolution_strategy || "balanced_match_and_discover",
      latency_tier: policy?.latency_tier || "balanced",
      prefer_existing_match: Boolean(policy?.prefer_existing_match),
      emphasize_focus_people: Boolean(policy?.emphasize_focus_people),
      require_focus_coverage_review: Boolean(policy?.require_focus_coverage_review),
      promote_mentioned_candidates: Boolean(policy?.promote_mentioned_candidates),
      source_priority_enabled: Boolean(policy?.source_priority_enabled),
      metrics: policy?.metrics || {}
    },
    source_summary: {
      source_count: request.sources.length,
      excerpt_count: prepared.truncation.used_excerpt_count,
      dropped_excerpt_count: prepared.truncation.dropped_excerpt_count,
      ordered_source_ids: prepared.source_ordering?.ordered_source_ids || request.sources.map((source) => source.source_id),
      target_people: request.target_people,
      focus_people: request.focus_people,
      focus_instruction: request.focus_instruction || ""
    },
    interaction_summary: normalizeInteractionSummary(parsed.interaction_summary),
    detected_people: detectedPeople,
    resolved_people: resolvedPeople,
    profile_updates: profileUpdates.map((update) => ({
      ...update,
      profile_tier: profileTierLookup.get(update.person_name) || "stub"
    })),
    person_profiles: personProfiles,
    relationship_edges: relationshipEdges,
    todos,
    evidence,
    review_flags: reviewFlags,
    review_bundle: reviewBundle,
    notes: normalizeOptionalString(parsed.notes) || ""
  };
}

function normalizeDetectedPerson(person, excerpts, evidenceIndexSet, normalizationIssues = []) {
  const rawPersonName = normalizeOptionalString(person?.name);
  const personName = normalizePersonName(rawPersonName);
  if (!personName) {
    pushNormalizationIssue(normalizationIssues, {
      level: "warning",
      field: "detected_people",
      reason: `忽略了疑似非人物名称：${truncate(rawPersonName || "空值", 24)}`
    });
    return null;
  }

  const matchedExcerptIndexes = normalizeMatchedExcerptIndexes(person?.matched_excerpt_indices, excerpts.length);
  matchedExcerptIndexes.forEach((index) => evidenceIndexSet.add(index));
  const evidence = normalizeEvidenceList(person?.evidence).slice(0, 3);
  if (!matchedExcerptIndexes.length && !evidence.length) {
    pushNormalizationIssue(normalizationIssues, {
      level: "warning",
      field: "profile_updates.evidence",
      reason: `${personName} 的档案更新缺少稳定证据，建议人工确认后再入库`
    });
  }
  const aliases = normalizePersonAliases(person?.aliases, personName);

  return {
    person_name: personName,
    aliases,
    confidence: normalizeConfidence(person?.confidence),
    matched_excerpt_indices: matchedExcerptIndexes,
    matched_source_ids: uniqueStrings(matchedExcerptIndexes.map((index) => excerpts[index - 1]?.source_id || "")),
    evidence: uniqueStrings([
      ...normalizeEvidenceList(person?.evidence),
      ...matchedExcerptIndexes.map((index) => excerpts[index - 1]?.text || "")
    ]).slice(0, 3)
  };
}

function normalizeResolvedPerson(person, existingPeople, existingLookup, policy, normalizationIssues = []) {
  const personName = normalizePersonName(person?.name);
  if (!personName) {
    return null;
  }

  const aliases = normalizePersonAliases(person?.aliases, personName);
  const requestedMatch = normalizePersonName(person?.matched_existing_person_name);
  const matchedExistingCandidate = matchExistingPerson({
    personName,
    aliases,
    requestedMatch,
    existingPeople,
    existingLookup
  });
  const matchedExisting = isStableExistingMatch({
    personName,
    aliases,
    requestedMatch,
    matchedExisting: matchedExistingCandidate
  })
    ? matchedExistingCandidate
    : null;

  const matchedExcerptIndexes = normalizeMatchedExcerptIndexes(person?.matched_excerpt_indices, Number.MAX_SAFE_INTEGER);
  const evidence = normalizeEvidenceList(person?.evidence).slice(0, 3);
  const confidence = normalizeConfidence(person?.confidence);
  const baseResolutionAction = deriveResolutionAction({
    requestedAction: normalizeOptionalString(person?.resolution_action) || "",
    matchedExisting,
    confidence,
    matchedExcerptCount: matchedExcerptIndexes.length,
    evidenceCount: evidence.length,
    requestedMatch,
    policy
  });
  const resolutionAction = !matchedExisting && isWeakStandalonePersonName(personName) ? "review" : baseResolutionAction;

  if (requestedMatch && !matchedExisting) {
    pushNormalizationIssue(normalizationIssues, {
      level: "warning",
      field: "resolved_people.matched_existing_person_name",
      reason: `${personName} existing match is not stable enough to merge automatically`
    });
  }
  if (matchedExistingCandidate && !matchedExisting) {
    pushNormalizationIssue(normalizationIssues, {
      level: "warning",
      field: "resolved_people.matched_existing_person_name",
      reason: `${personName} matched an existing person only through weak signals and was downgraded to review`
    });
  }

  return {
    person_name: personName,
    resolution_action: resolutionAction,
    matched_existing_person_id: matchedExisting?.person_id || null,
    matched_existing_person_name: matchedExisting?.name || null,
    reasoning: normalizeOptionalString(person?.reasoning) || inferResolutionReasoning(resolutionAction, matchedExisting),
    confidence
  };
}

function normalizeProfileUpdate(person, existingPeople, existingLookup, policy, excerpts, evidenceIndexSet, normalizationIssues = []) {
  const personName = normalizePersonName(person?.name);
  if (!personName) {
    return null;
  }

  const aliases = normalizePersonAliases(person?.aliases, personName);
  const requestedMatch = normalizePersonName(person?.matched_existing_person_name);
  const matchedExistingCandidate = matchExistingPerson({
    personName,
    aliases,
    requestedMatch,
    existingPeople,
    existingLookup
  });
  const matchedExisting = isStableExistingMatch({
    personName,
    aliases,
    requestedMatch,
    matchedExisting: matchedExistingCandidate
  })
    ? matchedExistingCandidate
    : null;

  const matchedExcerptIndexes = normalizeMatchedExcerptIndexes(person?.matched_excerpt_indices, excerpts.length);
  const evidence = normalizeEvidenceList(person?.evidence).slice(0, 3);
  const confidence = normalizeConfidence(person?.confidence);
  const baseResolutionAction = deriveResolutionAction({
    requestedAction: normalizeOptionalString(person?.resolution_action) || "",
    matchedExisting,
    confidence,
    matchedExcerptCount: matchedExcerptIndexes.length,
    evidenceCount: evidence.length,
    requestedMatch,
    policy
  });
  const resolutionAction = !matchedExisting && isWeakStandalonePersonName(personName) ? "review" : baseResolutionAction;
  if (resolutionAction === "ignore") {
    return null;
  }

  matchedExcerptIndexes.forEach((index) => evidenceIndexSet.add(index));
  if (!matchedExcerptIndexes.length && !evidence.length) {
    pushNormalizationIssue(normalizationIssues, {
      level: "warning",
      field: "profile_updates.evidence",
      reason: `${personName} profile update is missing stable evidence and should be reviewed before commit`
    });
  }
  if (requestedMatch && !matchedExisting) {
    pushNormalizationIssue(normalizationIssues, {
      level: "warning",
      field: "profile_updates.person_ref",
      reason: `${personName} profile ownership lacks stable overlap and stays as a review candidate`
    });
  }

  return {
    person_name: personName,
    person_ref: matchedExisting?.person_id || personName,
    resolution_action: resolutionAction,
    tags: normalizeProfileItems(person?.tags),
    traits: normalizeProfileItems(person?.traits),
    preferences: normalizeProfileItems(person?.preferences),
    boundaries: normalizeProfileItems(person?.boundaries),
    intent: normalizeNarrativeField(person?.intent, "???"),
    attitude: normalizeAttitude(person?.attitude),
    relationship_stage: normalizeNarrativeField(person?.relationship_stage, "???"),
    risk_flags: normalizeProfileItems(person?.risk_flags),
    summary: normalizeNarrativeField(person?.summary, `${personName} ???????????????`),
    matched_excerpt_indices: matchedExcerptIndexes,
    evidence
  };
}

function buildPersonProfiles({ profileUpdates, resolvedPeople, detectedPeople, todos, excerpts, interactionSummary, reviewFlags }) {
  const resolvedLookup = new Map(resolvedPeople.map((item) => [item.person_name, item]));
  const detectedLookup = new Map(detectedPeople.map((item) => [item.person_name, item]));

  return profileUpdates.map((update) => {
    const matchedExcerpts = update.matched_excerpt_indices
      .map((index) => excerpts[index - 1])
      .filter(Boolean);
    const personTodos = todos.filter((todo) => todo.person_name === update.person_name);
    const sourceIds = uniqueStrings(matchedExcerpts.map((excerpt) => excerpt.source_id));
    const timeline = buildPersonTimeline(matchedExcerpts);
    const profileTier = inferProfileTier({
      update,
      matchedExcerpts,
      sourceIds,
      todos: personTodos
    });
    const profileReviewFlags = reviewFlags.filter((flag) => {
      const reason = normalizeOptionalString(flag.reason);
      return !reason || reason.includes(update.person_name);
    });

    return {
      person_name: update.person_name,
      person_ref: update.person_ref,
      resolution_action: update.resolution_action,
      profile_tier: profileTier,
      confidence: detectedLookup.get(update.person_name)?.confidence || "medium",
      aliases: detectedLookup.get(update.person_name)?.aliases || [],
      compiled_truth: {
        summary: update.summary,
        current_judgment: deriveCurrentJudgment(update),
        relationship_stage: update.relationship_stage,
        intent: update.intent,
        attitude: update.attitude,
        traits: update.traits,
        tags: update.tags,
        preferences: update.preferences,
        boundaries: update.boundaries,
        risk_flags: update.risk_flags,
        open_questions: deriveProfileOpenQuestions(
          update,
          interactionSummary,
          profileReviewFlags,
          detectedLookup.get(update.person_name)?.aliases || []
        ),
        next_actions: personTodos.map((todo) => todo.title)
      },
      timeline,
      evidence_summary: {
        excerpt_count: matchedExcerpts.length,
        source_count: sourceIds.length,
        last_updated_at: inferLastUpdatedAt(matchedExcerpts),
        key_evidence: update.evidence
      },
      linked_relationships: {
        detected_as: detectedLookup.has(update.person_name),
        matched_existing_person_id: resolvedLookup.get(update.person_name)?.matched_existing_person_id || null,
        matched_existing_person_name: resolvedLookup.get(update.person_name)?.matched_existing_person_name || null
      }
    };
  });
}

function buildReviewBundle({ request, prepared, policy, detectedPeople, resolvedPeople, profileUpdates, personProfiles, reviewFlags }) {
  const focusSet = new Set((request.focus_people || []).map((item) => normalizeOptionalString(item)));
  const resolvedLookup = new Map(resolvedPeople.map((item) => [item.person_name, item]));
  const updateLookup = new Map(profileUpdates.map((item) => [item.person_name, item]));
  const detectedLookup = new Map(detectedPeople.map((item) => [item.person_name, item]));

  const profileCandidates = personProfiles.map((profile) => {
    const profileFlags = reviewFlagsForPerson(reviewFlags, profile.person_name);
    const blockingFlags = profileFlags.filter((flag) => isBlockingProfileReviewFlag(flag));
    const update = updateLookup.get(profile.person_name);
    const resolved = resolvedLookup.get(profile.person_name);
    const detected = detectedLookup.get(profile.person_name);
    const suggestedAction = resolved?.resolution_action || profile.resolution_action || "create";
    const questions = uniqueStrings([
      ...profile.compiled_truth.open_questions,
      ...profileFlags.map((flag) => flag.reason)
    ].filter(Boolean));

    return {
      person_name: profile.person_name,
      priority: deriveReviewPriority(profile, focusSet.has(profile.person_name)),
      needs_confirmation:
        suggestedAction === "create" ||
        suggestedAction === "review" ||
        (detected?.confidence || profile.confidence || "medium") === "low" ||
        blockingFlags.length > 0,
      confirmation_status: "pending",
      suggested_action: suggestedAction,
      confidence: detected?.confidence || profile.confidence || "medium",
      fields_to_confirm: [
        {
          field: "resolution_action",
          label: "是否保留该人物",
          current_value: resolved?.resolution_action || profile.resolution_action || "create"
        },
        {
          field: "compiled_truth.tags",
          label: "人物标签",
          current_value: profile.compiled_truth.tags
        },
        {
          field: "compiled_truth.traits",
          label: "人物特点",
          current_value: profile.compiled_truth.traits
        },
        {
          field: "compiled_truth.intent",
          label: "意图判断",
          current_value: update?.intent || profile.compiled_truth.intent
        },
        {
          field: "compiled_truth.relationship_stage",
          label: "关系阶段",
          current_value: update?.relationship_stage || profile.compiled_truth.relationship_stage
        },
        {
          field: "compiled_truth.next_actions",
          label: "后续动作",
          current_value: profile.compiled_truth.next_actions
        }
      ],
      evidence_preview: profile.evidence_summary.key_evidence,
      questions
    };
  });
  const mentionedCandidates = buildMentionedReviewCandidates({
    request,
    prepared,
    policy,
    detectedPeople,
    personProfiles
  });
  const candidates = [...profileCandidates, ...mentionedCandidates];
  const requiredCandidateCount = candidates.filter((candidate) => candidate.needs_confirmation).length;

  return {
    confirmation_required: requiredCandidateCount > 0,
    focus_people: request.focus_people || [],
    focus_instruction: request.focus_instruction || "",
    pending_count: candidates.length,
    required_candidate_count: requiredCandidateCount,
    candidates
  };
}

function reviewFlagsForPerson(reviewFlags, personName) {
  return reviewFlags.filter((flag) => {
    const reason = normalizeOptionalString(flag?.reason);
    if (!reason || !reason.includes(personName)) {
      return false;
    }

    const field = normalizeOptionalString(flag?.field);
    if (field.startsWith("interaction_summary")) {
      return false;
    }

    return true;
  });
}

function isBlockingProfileReviewFlag(flag) {
  const level = normalizeFlagLevel(flag?.level);
  return level === "warning" || level === "critical";
}

function buildMentionedReviewCandidates({ request, prepared, policy, detectedPeople, personProfiles }) {
  const existingLookup = buildExistingPersonLookup(request.existing_people);
  const coveredNames = new Set([
    ...detectedPeople.map((item) => item.person_name),
    ...personProfiles.map((item) => item.person_name)
  ]);
  const mentionCandidates = uniqueStrings([...(request.target_people || []), ...(request.focus_people || [])])
    .map((name) => normalizePersonName(name))
    .filter((name) => name && !coveredNames.has(name));

  return mentionCandidates
    .map((personName) => {
      const aliases =
        request.existing_people.find((person) => normalizePersonName(person.name) === personName)?.aliases || [];
      const mentionSummary = collectMentionEvidence({
        personName,
        aliases,
        excerpts: prepared.excerpts,
        minimumMatches: policy?.input_handling === "batch" ? 2 : 1
      });
      if (!mentionSummary) {
        return null;
      }

      const matchedExisting = matchExistingPerson({
        personName,
        aliases: normalizePersonAliases(aliases, personName),
        requestedMatch: personName,
        existingPeople: request.existing_people,
        existingLookup
      });

      return {
        person_name: personName,
        priority: focusSetFromRequest(request).has(personName) ? "high" : "medium",
        needs_confirmation: true,
        confirmation_status: "pending",
        suggested_action: "review",
        confidence: mentionSummary.match_count >= 2 ? "medium" : "low",
        fields_to_confirm: [
          {
            field: "resolution_action",
            label: "是否保留该人物",
            current_value: matchedExisting ? "review" : "create"
          },
          {
            field: "compiled_truth.summary",
            label: "人物摘要",
            current_value: matchedExisting
              ? "资料中再次提到该已有联系人，但尚未稳定抽取为正式档案更新。"
              : "资料中提到了该人物，但尚未形成稳定档案，建议人工确认。"
          }
        ],
        evidence_preview: mentionSummary.evidence_preview,
        questions: [
          matchedExisting
            ? "该人物已存在于关系库中，是否应将这次信息并入已有档案？"
            : "该人物在资料中被提及，但未稳定抽取为正式档案，是否要新建？"
        ]
      };
    })
    .filter(Boolean);
}

function buildPersonTimeline(matchedExcerpts) {
  return matchedExcerpts
    .slice()
    .sort((left, right) => compareTimelineDate(left?.source_captured_at, right?.source_captured_at))
    .map((excerpt, index) => ({
      timeline_id: `timeline-${index + 1}`,
      date: normalizeOptionalString(excerpt.source_captured_at) || "待判断",
      source_id: excerpt.source_id,
      source_title: excerpt.source_title,
      relative_path: normalizeOptionalString(excerpt.source_relative_path) || "",
      event_summary: truncate(excerpt.text, 140),
      matched_excerpt_index: excerpt.excerpt_index
    }));
}

function inferProfileTier({ update, matchedExcerpts, sourceIds, todos }) {
  if (update.relationship_stage === "待激活") {
    return "archived";
  }

  const detailSignals =
    update.tags.length +
    update.traits.length +
    update.preferences.length +
    update.boundaries.length +
    update.risk_flags.length;

  if (sourceIds.length >= 2 || matchedExcerpts.length >= 4 || todos.length >= 2 || detailSignals >= 8) {
    return "key";
  }

  if (matchedExcerpts.length >= 2 || detailSignals >= 3 || update.intent !== "待判断") {
    return "active";
  }

  return "stub";
}

function deriveReviewPriority(profile, isFocused) {
  if (isFocused) {
    return "high";
  }
  if (profile.profile_tier === "key") {
    return "high";
  }
  if (profile.profile_tier === "active") {
    return "medium";
  }
  return "low";
}

function focusSetFromRequest(request) {
  return new Set((request.focus_people || []).map((item) => normalizePersonName(item) || normalizeOptionalString(item)));
}

function deriveCurrentJudgment(update) {
  const traits = update.traits.slice(0, 2).join("、");
  const stage = update.relationship_stage === "待判断" ? "关系状态待确认" : `当前处于${update.relationship_stage}`;
  if (traits && update.intent !== "待判断") {
    return `${update.person_name}目前呈现出${traits}的特点，${stage}，其主要意图是${update.intent}`;
  }
  if (traits) {
    return `${update.person_name}目前呈现出${traits}的特点，${stage}。`;
  }
  return `${update.person_name}已形成初步档案，${stage}。`;
}

function deriveProfileOpenQuestions(update, interactionSummary, reviewFlags, aliases = []) {
  const questions = [];

  if (update.intent === "待判断") {
    questions.push("对方的核心意图仍需更多互动证据确认。");
  }
  if (update.relationship_stage === "待判断") {
    questions.push("当前关系阶段仍需人工确认。");
  }
  if (!update.preferences.length) {
    questions.push("对方偏好信息仍不够充分。");
  }

  interactionSummary.open_questions.forEach((question) => {
    if (
      questions.length < 4 &&
      !questions.includes(question) &&
      isQuestionRelevantToPerson(question, update.person_name, aliases, interactionSummary.six_elements.people)
    ) {
      questions.push(question);
    }
  });

  reviewFlags.forEach((flag) => {
    if (questions.length < 4 && !questions.includes(flag.reason)) {
      questions.push(flag.reason);
    }
  });

  return questions.slice(0, 4);
}

function collectMentionEvidence({ personName, aliases = [], excerpts = [], minimumMatches = 1 }) {
  const names = uniqueStrings([personName, ...aliases].map((item) => normalizePersonName(item) || normalizeOptionalString(item)).filter(Boolean));
  if (!names.length) {
    return null;
  }

  const matchedExcerpts = excerpts.filter((excerpt) => {
    const text = String(excerpt?.text || "");
    return names.some((name) => name && text.includes(name));
  });

  if (matchedExcerpts.length < minimumMatches) {
    return null;
  }

  return {
    match_count: matchedExcerpts.length,
    evidence_preview: matchedExcerpts.slice(0, 3).map((excerpt) => truncate(excerpt.text, 140))
  };
}

function inferLastUpdatedAt(matchedExcerpts) {
  const dated = matchedExcerpts
    .map((excerpt) => normalizeOptionalString(excerpt.source_captured_at))
    .filter(Boolean)
    .sort(compareTimelineDate);

  return dated.at(-1) || "待判断";
}

function compareTimelineDate(left, right) {
  const leftValue = Date.parse(normalizeOptionalString(left) || "");
  const rightValue = Date.parse(normalizeOptionalString(right) || "");

  const leftValid = Number.isFinite(leftValue);
  const rightValid = Number.isFinite(rightValue);

  if (!leftValid && !rightValid) {
    return 0;
  }
  if (!leftValid) {
    return 1;
  }
  if (!rightValid) {
    return -1;
  }

  return leftValue - rightValue;
}

function normalizeRelationshipEdges(items, excerpts, evidenceIndexSet) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((edge, index) => {
      const from = normalizeOptionalString(edge?.from);
      const to = normalizeOptionalString(edge?.to);
      if (!from || !to) {
        return null;
      }

      const matchedExcerptIndexes = normalizeMatchedExcerptIndexes(edge?.matched_excerpt_indices, excerpts.length);
      matchedExcerptIndexes.forEach((value) => evidenceIndexSet.add(value));

      return {
        edge_id: `edge-${index + 1}`,
        from_person_name: from,
        to_person_name: to,
        edge_type: normalizeOptionalString(edge?.edge_type) || "待判断",
        confidence: normalizeConfidence(edge?.confidence),
        matched_excerpt_indices: matchedExcerptIndexes,
        evidence: normalizeStringArray(edge?.evidence).slice(0, 3)
      };
    })
    .filter(Boolean);
}

function normalizeTodos(people, excerpts, evidenceIndexSet) {
  const items = [];

  people.forEach((person) => {
    const personName = normalizeOptionalString(person?.name);
    if (!personName) {
      return;
    }
    const matchedExcerptIndexes = normalizeMatchedExcerptIndexes(person?.matched_excerpt_indices, excerpts.length);
    matchedExcerptIndexes.forEach((value) => evidenceIndexSet.add(value));

    normalizeStringArray(person?.todos).forEach((todo) => {
      items.push({
        todo_id: `todo-${items.length + 1}`,
        person_name: personName,
        title: todo,
        priority: matchedExcerptIndexes.length > 0 ? "medium" : "low",
        reason: normalizeOptionalString(person?.intent) || "来自关系资料抽取结果",
        matched_excerpt_indices: matchedExcerptIndexes,
        evidence: normalizeStringArray(person?.evidence).slice(0, 2)
      });
    });
  });

  return items;
}

function buildEvidenceCatalog(excerpts, evidenceIndexSet) {
  return Array.from(evidenceIndexSet)
    .sort((a, b) => a - b)
    .map((index) => excerpts[index - 1])
    .filter(Boolean)
    .map((excerpt, position) => ({
      evidence_id: `evidence-${position + 1}`,
      excerpt_index: excerpt.excerpt_index,
      source_id: excerpt.source_id,
      source_title: excerpt.source_title,
      source_relative_path: normalizeOptionalString(excerpt.source_relative_path) || "",
      source_captured_at: normalizeOptionalString(excerpt.source_captured_at) || "",
      excerpt: excerpt.text
    }));
}

function normalizeReviewFlags({ modelFlags, detectedPeople, prepared, request, normalizationIssues = [] }) {
  const flags = [];

  if (Array.isArray(modelFlags)) {
    modelFlags.forEach((flag) => {
      const reason = normalizeOptionalString(flag?.reason);
      if (!reason) {
        return;
      }
      flags.push({
        level: normalizeFlagLevel(flag?.level),
        field: normalizeOptionalString(flag?.field) || "",
        reason
      });
    });
  }

  if (prepared.truncation.dropped_excerpt_count > 0) {
    flags.push({
      level: "warning",
      field: "source_summary.dropped_excerpt_count",
      reason: `有 ${prepared.truncation.dropped_excerpt_count} 段资料未送入模型，结果可能不完整。`
    });
  }

  if (!detectedPeople.length) {
    flags.push({
      level: "warning",
      field: "detected_people",
      reason: "当前没有抽取到可建档人物，建议人工检查资料质量或提示词。"
    });
  }

  const detectedNameSet = new Set(detectedPeople.map((person) => person.person_name));
  (request?.focus_people || []).forEach((focusPerson) => {
    const normalizedFocus = normalizePersonName(focusPerson) || normalizeOptionalString(focusPerson);
    if (normalizedFocus && !detectedNameSet.has(normalizedFocus)) {
      flags.push({
        level: "warning",
        field: "focus_people",
        reason: `重点关注人物 ${normalizedFocus} 未被稳定识别，建议人工检查资料或补充别名`
      });
    }
  });

  normalizationIssues.forEach((issue) => {
    if (!issue?.reason) {
      return;
    }
    flags.push({
      level: normalizeFlagLevel(issue.level),
      field: normalizeOptionalString(issue.field) || "",
      reason: issue.reason
    });
  });

  return dedupeReviewFlags(flags);
}

function normalizeInteractionSummary(summary) {
  const value = summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {};
  const sixElements = value.six_elements && typeof value.six_elements === "object" && !Array.isArray(value.six_elements)
    ? value.six_elements
    : {};

  return {
    summary: normalizeOptionalString(value.summary) || "待人工确认",
    six_elements: {
      time: normalizeOptionalString(sixElements.time) || "待判断",
      location: normalizeOptionalString(sixElements.location) || "待判断",
      people: normalizeStringArray(sixElements.people),
      trigger: normalizeOptionalString(sixElements.trigger) || "待判断",
      process: normalizeOptionalString(sixElements.process) || "待判断",
      outcome: normalizeOptionalString(sixElements.outcome) || "待判断"
    },
    key_points: normalizeStringArray(value.key_points),
    open_questions: normalizeStringArray(value.open_questions)
  };
}

function normalizeMatchedExcerptIndexes(values, maxIndex) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value))
        .map((value) => Math.trunc(value))
        .filter((value) => value >= 1 && value <= maxIndex)
    )
  );
}

function buildExistingPersonLookup(existingPeople) {
  const map = new Map();
  existingPeople.forEach((person) => {
    const aliases = normalizePersonAliases(person?.aliases, person?.name);
    [person.name, ...aliases].forEach((name) => {
      const key = buildLookupKey(name);
      if (!key) {
        return;
      }
      const bucket = map.get(key) || [];
      if (!bucket.some((item) => item.person_id === person.person_id && item.name === person.name)) {
        bucket.push(person);
      }
      map.set(key, bucket);
    });
  });
  return map;
}

function matchExistingPerson({ personName, aliases, requestedMatch, existingPeople, existingLookup }) {
  const directCandidates = uniqueStrings([personName, requestedMatch, ...aliases].map((item) => buildLookupKey(item)).filter(Boolean));

  for (const candidate of directCandidates) {
    const matches = existingLookup.get(candidate) || [];
    if (matches.length === 1) {
      return matches[0];
    }
    if (matches.length > 1) {
      const exactNameMatches = matches.filter((person) => buildLookupKey(person.name) === candidate);
      if (exactNameMatches.length === 1) {
        return exactNameMatches[0];
      }
    }
  }

  const requestedKey = buildLookupKey(requestedMatch);
  if (requestedKey) {
    return existingPeople.find((person) => buildLookupKey(person.name) === requestedKey) || null;
  }

  return null;
}

function buildStableMatchTokens(name, aliases = []) {
  return uniqueStrings(
    [name, ...aliases]
      .map((value) => normalizeOptionalString(value))
      .filter(Boolean)
      .filter((value) => !isSuspiciousAlias(value))
      .map((value) => buildLookupKey(value))
      .filter(Boolean)
  );
}

function isStableExistingMatch({ personName, aliases, requestedMatch, matchedExisting }) {
  if (!matchedExisting) {
    return false;
  }

  const sourceTokens = new Set(buildStableMatchTokens(personName, aliases));
  const existingTokens = new Set(buildStableMatchTokens(matchedExisting.name, matchedExisting.aliases || []));

  for (const token of sourceTokens) {
    if (existingTokens.has(token)) {
      return true;
    }
  }

  const requestedKey = buildLookupKey(requestedMatch);
  if (requestedKey && sourceTokens.has(requestedKey) && existingTokens.has(requestedKey)) {
    return true;
  }

  return false;
}

function deriveResolutionAction({
  requestedAction,
  matchedExisting,
  confidence,
  matchedExcerptCount,
  evidenceCount,
  requestedMatch,
  policy
}) {
  if (requestedAction === "ignore") {
    return "ignore";
  }

  const allowedAction = ["create", "update", "review"].includes(requestedAction) ? requestedAction : "";
  const defaultAction = matchedExisting ? "update" : "create";
  const initialAction = allowedAction || defaultAction;
  const weakEvidence = matchedExcerptCount === 0 && evidenceCount === 0;
  const thinEvidence = matchedExcerptCount <= 1 && evidenceCount <= 1;
  const lowConfidence = confidence === "low";
  const missingRequestedMatch = Boolean(requestedMatch) && !matchedExisting;

  if (missingRequestedMatch) {
    return "review";
  }
  if (initialAction === "create" && matchedExisting) {
    return "review";
  }
  if (initialAction === "update" && !matchedExisting && policy?.prefer_existing_match) {
    return "review";
  }
  if (!matchedExisting && weakEvidence) {
    return "review";
  }
  if (!matchedExisting && lowConfidence) {
    return policy?.input_handling === "batch" ? "review" : "create";
  }
  if (!matchedExisting && thinEvidence && policy?.context_profile === "cold_start") {
    return "review";
  }

  return initialAction;
}

function inferResolutionReasoning(action, matchedExisting) {
  if (action === "update" && matchedExisting) {
    return "命中已有联系人，建议补充其最新档案信息。";
  }
  if (action === "review") {
    return matchedExisting
      ? "初步命中现有联系人，但证据或匹配还不够稳定，建议人工确认后再更新。"
      : "资料中出现了可能值得建档的人物，但证据还不足以直接入库，建议人工确认。";
  }
  if (action === "ignore") {
    return "当前证据不足或人物不值得建档，建议暂时忽略。";
  }
  return "资料中出现了值得建立联系人档案的真实人物。";
}

function normalizeAttitude(attitude) {
  const value = attitude && typeof attitude === "object" && !Array.isArray(attitude) ? attitude : {};
  return {
    label: normalizeNarrativeField(value.label, "pending"),
    reason: normalizeNarrativeField(value.reason, "No stable attitude signal found in the current evidence.")
  };
}

function normalizeConfidence(value) {
  const label = normalizeOptionalString(value)?.toLowerCase() || "";
  return ["high", "medium", "low"].includes(label) ? label : "medium";
}

function normalizeFlagLevel(value) {
  const label = normalizeOptionalString(value)?.toLowerCase() || "";
  return ["info", "warning", "critical"].includes(label) ? label : "warning";
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return uniqueStrings(values.map((value) => normalizeOptionalString(value)).filter(Boolean));
}

function uniqueStrings(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizePersonName(value) {
  const next = normalizeOptionalString(value)
    .replace(/^[#*@\-+?\s]+/, "")
    .replace(/[?:?,??;?!??]+$/g, "");

  if (!next) {
    return "";
  }
  if (PERSON_PLACEHOLDER_NAMES.has(next)) {
    return "";
  }
  if (next.includes("\u8bf4\u8bdd\u4eba") && (next.includes("\u6211") || next.startsWith("\u8bf4\u8bdd\u4eba"))) {
    return "";
  }
  if (next.length > 24 || /[\\/]/.test(next) || /[\r\n\t]/.test(next)) {
    return "";
  }
  if (/^[0-9]+$/.test(next)) {
    return "";
  }
  if (/^[a-z]{1,2}$/i.test(next)) {
    return "";
  }
  if (/^[a-z0-9_-]+$/i.test(next) && next.length < 3) {
    return "";
  }
  if (/[?:?,??;?!??]/.test(next)) {
    return "";
  }

  return next;
}

function isWeakStandalonePersonName(value) {
  const next = normalizePersonName(value);
  if (!next) {
    return true;
  }
  return next.length === 1 && /[\u4e00-\u9fa5]/.test(next);
}

function normalizePersonAliases(values, personName = "") {
  const personKey = buildLookupKey(personName);
  return normalizeProfileItems(values, { maxLength: 24 }).filter((alias) => {
    if (!alias) {
      return false;
    }
    if (buildLookupKey(alias) === personKey) {
      return false;
    }
    if (isSuspiciousAlias(alias)) {
      return false;
    }
    return true;
  });
}

function normalizeProfileItems(values, { maxLength = 80 } = {}) {
  if (!Array.isArray(values)) {
    return [];
  }

  return uniqueStrings(
    values
      .map((value) => normalizeOptionalString(value))
      .filter(Boolean)
      .filter((value) => !isPlaceholderValue(value))
      .filter((value) => value.length <= maxLength)
      .filter((value) => !/[\\/]/.test(value))
  );
}

function normalizeEvidenceList(values) {
  return normalizeProfileItems(values, { maxLength: 220 });
}

function normalizeNarrativeField(value, fallback = "") {
  const next = normalizeOptionalString(value);
  if (!next || isPlaceholderValue(next)) {
    return fallback;
  }
  return next;
}

function isPlaceholderValue(value) {
  return PLACEHOLDER_VALUES.has(normalizeOptionalString(value).toLowerCase());
}

function isSuspiciousAlias(alias) {
  const next = normalizeOptionalString(alias);
  if (!next) {
    return true;
  }
  if (PERSON_PLACEHOLDER_NAMES.has(next)) {
    return true;
  }
  if (next.startsWith("\u8bf4\u8bdd\u4eba")) {
    return true;
  }
  if (/^speaker[\s_-]*[a-z0-9]+$/i.test(next)) {
    return true;
  }
  if (/^[a-z]{1,2}$/i.test(next)) {
    return true;
  }
  if (/^[a-z0-9_-]+$/i.test(next) && next.length < 3) {
    return true;
  }
  return false;
}

function isQuestionRelevantToPerson(question, personName, aliases = [], interactionPeople = []) {
  const normalizedQuestion = normalizeOptionalString(question);
  if (!normalizedQuestion) {
    return false;
  }

  const candidates = uniqueStrings([personName, ...aliases].map((value) => normalizeOptionalString(value)).filter(Boolean));
  if (candidates.some((candidate) => normalizedQuestion.includes(candidate))) {
    return true;
  }

  const normalizedPeople = normalizeProfileItems(interactionPeople, { maxLength: 24 });
  if (normalizedPeople.length <= 1) {
    return true;
  }

  return false;
}

function buildLookupKey(value) {
  const next = normalizeOptionalString(value).toLowerCase();
  if (!next) {
    return "";
  }
  return next.replace(/[\s\-_/\\.,，。:：;；'"`“”‘’()[\]{}]+/g, "");
}

function pushNormalizationIssue(target, issue) {
  if (!Array.isArray(target) || !issue?.reason) {
    return;
  }
  const normalizedField = normalizeOptionalString(issue.field);
  const normalizedReason = normalizeOptionalString(issue.reason);
  if (!normalizedReason) {
    return;
  }
  const exists = target.some(
    (item) => normalizeOptionalString(item.field) === normalizedField && normalizeOptionalString(item.reason) === normalizedReason
  );
  if (!exists) {
    target.push({
      level: normalizeFlagLevel(issue.level),
      field: normalizedField,
      reason: normalizedReason
    });
  }
}

function dedupeReviewFlags(flags) {
  const seen = new Set();
  return flags.filter((flag) => {
    const key = `${normalizeFlagLevel(flag?.level)}|${normalizeOptionalString(flag?.field)}|${normalizeOptionalString(flag?.reason)}`;
    if (!normalizeOptionalString(flag?.reason) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalizeOptionalString(value) {
  const next = String(value ?? "").trim();
  return next || "";
}

function truncate(value, maxLength) {
  const normalized = normalizeOptionalString(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function readTextFile(filePath) {
  return readFileSync(filePath, "utf8");
}

function extractAssistantText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (item && typeof item.text === "string" ? item.text : ""))
      .join("\n")
      .trim();
  }
  throw createHttpError(502, "模型没有返回可解析内容。");
}

function parseJsonPayload(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw createHttpError(502, "模型没有返回合法 JSON。", {
      raw_text_preview: candidate.slice(0, 400)
    });
  }

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw createHttpError(502, "模型返回的 JSON 无法解析。", {
      raw_text_preview: candidate.slice(0, 400),
      cause: error instanceof Error ? error.message : String(error)
    });
  }
}

function persistRunArtifacts({ request, result, raw = null }) {
  ensureDirectory(runsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = (request.request_id || "run").replace(/[^a-zA-Z0-9-_]/g, "-");
  const runDirectory = path.join(runsDir, `${stamp}-${safeId}`);
  ensureDirectory(runDirectory);
  writeFileSync(path.join(runDirectory, "request.json"), `${JSON.stringify(maskSensitiveRequest(request), null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "response.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  if (raw) {
    writeFileSync(path.join(runDirectory, "raw-response.json"), `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  }
  return runDirectory;
}

function persistFailedRunArtifacts({ request, failures }) {
  ensureDirectory(runsDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeId = (request.request_id || "run").replace(/[^a-zA-Z0-9-_]/g, "-");
  const runDirectory = path.join(runsDir, `${stamp}-${safeId}-failed`);
  ensureDirectory(runDirectory);
  writeFileSync(path.join(runDirectory, "request.json"), `${JSON.stringify(maskSensitiveRequest(request), null, 2)}\n`, "utf8");
  writeFileSync(path.join(runDirectory, "failures.json"), `${JSON.stringify(failures, null, 2)}\n`, "utf8");
  return runDirectory;
}

function attachDerivedPolicy(request, policy) {
  return {
    ...request,
    _derived_policy: policy
  };
}

function maskSensitiveRequest(request) {
  const cloned = JSON.parse(JSON.stringify(request));
  if (cloned.model_config?.api_key) {
    cloned.model_config.api_key = maskApiKey(cloned.model_config.api_key);
  }
  return cloned;
}

function maskApiKey(value) {
  const apiKey = String(value || "");
  if (!apiKey) {
    return "";
  }
  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}***`;
  }
  return `${apiKey.slice(0, 3)}***${apiKey.slice(-4)}`;
}

function buildRequestId() {
  return `req-${Date.now()}`;
}

function ensureDirectory(directoryPath) {
  mkdirSync(directoryPath, { recursive: true });
}

function createHttpError(statusCode, message, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

export const __internal = {
  deriveIngestionPolicy,
  deriveResolutionAction,
  formatExistingPeopleForPrompt,
  reviewFlagsForPerson,
  isBlockingProfileReviewFlag,
  isWeakStandalonePersonName,
  isSuspiciousAlias,
  isStableExistingMatch,
  normalizePersonName,
  normalizePersonAliases,
  normalizeProfileItems,
  normalizeNarrativeField,
  isQuestionRelevantToPerson,
  collectMentionEvidence,
  buildLookupKey,
  buildExistingPersonLookup,
  matchExistingPerson,
  scoreSourceForPolicy,
  resolveAttemptStrategy
};


