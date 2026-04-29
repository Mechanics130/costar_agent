// SPDX-License-Identifier: Apache-2.0
import {
  normalizeAttitudeIntent,
  normalizeKeyIssues,
  normalizeLatentNeeds
} from "../relationship-insights.mjs";

const SUBSTANTIAL_SOURCE_LENGTH = 500;
const SOURCE_SIGNAL_PATTERNS = [
  { label: "speaker", pattern: /\b(speaker|said|quote|key quote)\b|说话人|关键语句|关键句|原话/u },
  { label: "role", pattern: /\b(role|owner|responsible|profile)\b|角色|职责|画像|负责人/u },
  { label: "attitude", pattern: /\b(attitude|supportive|blocking|cautious|concern)\b|态度|支持|反对|担心|谨慎/u },
  { label: "intent", pattern: /\b(intent|goal|wants|needs|hidden need)\b|意图|目的|需求|隐形需求/u },
  { label: "issue", pattern: /\b(consensus|non-consensus|issue|unresolved|agreement)\b|共识|非共识|议题|分歧/u },
  { label: "next_action", pattern: /\b(next action|follow-up|send|ask)\b|下一步|待办|行动/u }
];
const GENERIC_PLACEHOLDERS = new Set([
  "",
  "tbd",
  "todo",
  "to be determined",
  "pending",
  "unknown",
  "unknown-source",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "待判断",
  "待补充",
  "未命名资料",
  "direct communication input",
  "imported relationship event"
]);

export function withExtractionWarnings(ingestionResult, request = {}) {
  if (!ingestionResult || typeof ingestionResult !== "object" || Array.isArray(ingestionResult)) {
    return ingestionResult;
  }
  const warnings = mergeWarnings(ingestionResult.extraction_warnings, buildExtractionWarnings(ingestionResult, request));
  return {
    ...ingestionResult,
    extraction_warnings: warnings
  };
}

export function buildExtractionWarnings(ingestionResult, request = {}) {
  const sourceAnalysis = analyzeSources({
    requestSources: request.sources,
    ingestionSources: ingestionResult.sources
  });
  const profiles = Array.isArray(ingestionResult?.person_profiles) ? ingestionResult.person_profiles : [];
  if (!profiles.length) {
    return [];
  }

  return profiles
    .map((profile) => buildProfileExtractionWarning(profile, sourceAnalysis))
    .filter(Boolean);
}

export function getExtractionWarningsForPerson(result, personName) {
  const ingestionResult = result?.ingestion_result && typeof result.ingestion_result === "object"
    ? result.ingestion_result
    : result;
  const warnings = Array.isArray(ingestionResult?.extraction_warnings)
    ? ingestionResult.extraction_warnings
    : Array.isArray(result?.extraction_warnings) ? result.extraction_warnings : [];
  const key = normalizeKey(personName);
  return warnings.filter((warning) => normalizeKey(warning?.person_name) === key);
}

function buildProfileExtractionWarning(profile, sourceAnalysis) {
  const personName = normalizeString(profile?.person_name || profile?.name);
  if (!personName) {
    return null;
  }

  const compiledTruth = profile?.compiled_truth && typeof profile.compiled_truth === "object"
    ? profile.compiled_truth
    : {};
  const missingFields = [];
  if (sourceAnalysis.hasProfileSignals && isEmptyTextArray(compiledTruth.traits)) {
    missingFields.push("compiled_truth.traits");
  }
  if (sourceAnalysis.hasProfileSignals && isEmptyTextArray(compiledTruth.tags)) {
    missingFields.push("compiled_truth.tags");
  }
  if (sourceAnalysis.hasActionSignals && isEmptyTextArray(compiledTruth.next_actions)) {
    missingFields.push("compiled_truth.next_actions");
  }
  if (sourceAnalysis.hasNeedSignals && !hasLatentNeedsContent(compiledTruth.latent_needs)) {
    missingFields.push("compiled_truth.latent_needs");
  }
  if (sourceAnalysis.hasIssueSignals && !hasKeyIssuesContent(compiledTruth.key_issues)) {
    missingFields.push("compiled_truth.key_issues");
  }
  if (sourceAnalysis.hasAttitudeIntentSignals && !hasAttitudeIntentContent(compiledTruth.attitude_intent)) {
    missingFields.push("compiled_truth.attitude_intent");
  }
  if (hasTimelinePlaceholder(profile.timeline)) {
    missingFields.push("timeline.source");
  }

  if (!missingFields.length) {
    return null;
  }

  return {
    warning_type: "possible_underextraction",
    severity: "warning",
    person_name: personName,
    missing_fields: Array.from(new Set(missingFields)),
    source_signals: sourceAnalysis.signal_labels,
    message: "Source material appears richer than the extracted profile. Ask the host model or user to re-check these fields before commit."
  };
}

function analyzeSources({ requestSources, ingestionSources }) {
  const sourceText = normalizeSourceText(requestSources) || normalizeSourceText(ingestionSources);
  const signalLabels = SOURCE_SIGNAL_PATTERNS
    .filter((item) => item.pattern.test(sourceText))
    .map((item) => item.label);
  const signalSet = new Set(signalLabels);
  const substantial = sourceText.length >= SUBSTANTIAL_SOURCE_LENGTH;

  return {
    source_text_length: sourceText.length,
    signal_labels: signalLabels,
    hasProfileSignals: substantial && (signalSet.has("speaker") || signalSet.has("role") || signalSet.has("attitude")),
    hasNeedSignals: substantial && signalSet.has("intent"),
    hasIssueSignals: substantial && signalSet.has("issue"),
    hasAttitudeIntentSignals: substantial && (signalSet.has("attitude") || signalSet.has("intent")),
    hasActionSignals: substantial && signalSet.has("next_action")
  };
}

function normalizeSourceText(sources) {
  if (!Array.isArray(sources)) {
    return "";
  }
  return sources
    .map((source) => [
      source?.content,
      source?.text,
      source?.body,
      source?.markdown,
      source?.summary,
      source?.source_title,
      source?.title,
      source?.name
    ].map((value) => normalizeString(value)).filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

function hasLatentNeedsContent(value) {
  const latentNeeds = normalizeLatentNeeds(value);
  return [...latentNeeds.counterpart, ...latentNeeds.self].some((item) => !isPlaceholderValue(item.need));
}

function hasKeyIssuesContent(value) {
  return normalizeKeyIssues(value).some((item) => {
    const texts = [
      item.issue,
      ...item.consensus,
      ...item.non_consensus,
      ...item.key_quotes,
      ...item.evidence
    ];
    return texts.some((text) => !isPlaceholderValue(text));
  });
}

function hasAttitudeIntentContent(value) {
  const attitudeIntent = normalizeAttitudeIntent(value);
  return [attitudeIntent.counterpart, attitudeIntent.self].some((side) => (
    !isPlaceholderValue(side.attitude)
    || !isPlaceholderValue(side.intent)
    || side.evidence.some((text) => !isPlaceholderValue(text))
  ));
}

function hasTimelinePlaceholder(timeline) {
  if (!Array.isArray(timeline)) {
    return false;
  }
  return timeline.some((item) => (
    isPlaceholderValue(item?.source_id)
    || isPlaceholderValue(item?.source_title)
    || isPlaceholderValue(item?.event_summary)
  ));
}

function isEmptyTextArray(value) {
  return !Array.isArray(value) || value.every((item) => isPlaceholderValue(item));
}

function mergeWarnings(existingWarnings, nextWarnings) {
  const map = new Map();
  [...normalizeWarnings(existingWarnings), ...normalizeWarnings(nextWarnings)].forEach((warning) => {
    const key = [
      normalizeKey(warning.warning_type),
      normalizeKey(warning.person_name),
      normalizeString(warning.missing_fields?.join("|"))
    ].join("::");
    map.set(key, warning);
  });
  return Array.from(map.values());
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings)
    ? warnings.filter((warning) => warning && typeof warning === "object" && !Array.isArray(warning))
    : [];
}

function isPlaceholderValue(value) {
  const normalized = normalizeString(value);
  const key = normalized.toLowerCase();
  return GENERIC_PLACEHOLDERS.has(key)
    || normalized.includes("待判断")
    || normalized.includes("待补充")
    || normalized.includes("未命名资料")
    || normalized.includes("寰呭垽")
    || normalized.includes("寰呰")
    || normalized.includes("鏈懡");
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}
