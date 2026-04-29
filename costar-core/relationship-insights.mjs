// SPDX-License-Identifier: Apache-2.0
const CONFIDENCE_ORDER = {
  low: 1,
  medium: 2,
  high: 3
};

const PLACEHOLDER_VALUES = new Set([
  "",
  "待判断",
  "pending",
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined"
]);

export function normalizeLatentNeeds(value) {
  if (Array.isArray(value)) {
    return {
      counterpart: normalizeNeedItems(value),
      self: []
    };
  }

  const source = toObject(value);
  return {
    counterpart: normalizeNeedItems(
      firstArray([
        source.counterpart,
        source.counterparty,
        source.relationship_person,
        source.person,
        source.other_party,
        source.their_needs,
        source.counterpart_needs,
        source.needs,
        source.items
      ])
    ),
    self: normalizeNeedItems(
      firstArray([
        source.self,
        source.me,
        source.my,
        source.user,
        source.owner,
        source.my_needs,
        source.self_needs
      ])
    )
  };
}

export function normalizeKeyIssues(value) {
  const source = Array.isArray(value) ? value : firstArray([toObject(value).issues, toObject(value).key_issues]);
  return source
    .map((item) => normalizeKeyIssue(item))
    .filter(Boolean)
    .slice(0, 8);
}

export function normalizeAttitudeIntent(value) {
  const source = toObject(value);
  const rootAsCounterpart = hasAttitudeIntentShape(source) ? source : null;
  return {
    counterpart: normalizeAttitudeIntentSide(
      firstObject([
        source.counterpart,
        source.counterparty,
        source.relationship_person,
        source.person,
        source.other_party,
        rootAsCounterpart,
        {
          attitude: source.counterpart_attitude,
          intent: source.counterpart_intent,
          evidence: source.counterpart_evidence,
          confidence: source.counterpart_confidence
        }
      ])
    ),
    self: normalizeAttitudeIntentSide(
      firstObject([
        source.self,
        source.me,
        source.my,
        source.user,
        source.owner,
        {
          attitude: source.self_attitude,
          intent: source.self_intent,
          evidence: source.self_evidence,
          confidence: source.self_confidence
        }
      ])
    )
  };
}

export function mergeLatentNeeds(left, right) {
  const normalizedLeft = normalizeLatentNeeds(left);
  const normalizedRight = normalizeLatentNeeds(right);
  return {
    counterpart: mergeByKey(normalizedLeft.counterpart, normalizedRight.counterpart, "need", mergeNeedItem),
    self: mergeByKey(normalizedLeft.self, normalizedRight.self, "need", mergeNeedItem)
  };
}

export function mergeKeyIssues(left, right) {
  return mergeByKey(normalizeKeyIssues(left), normalizeKeyIssues(right), "issue", mergeKeyIssue);
}

export function mergeAttitudeIntent(left, right) {
  const normalizedLeft = normalizeAttitudeIntent(left);
  const normalizedRight = normalizeAttitudeIntent(right);
  return {
    counterpart: mergeAttitudeIntentSide(normalizedLeft.counterpart, normalizedRight.counterpart),
    self: mergeAttitudeIntentSide(normalizedLeft.self, normalizedRight.self)
  };
}

export function needsInsightReview(compiledTruth) {
  const latentNeeds = normalizeLatentNeeds(compiledTruth?.latent_needs);
  const keyIssues = normalizeKeyIssues(compiledTruth?.key_issues);
  const attitudeIntent = normalizeAttitudeIntent(compiledTruth?.attitude_intent);

  const lowConfidenceNeeds = [...latentNeeds.counterpart, ...latentNeeds.self].some(
    (item) => item.confidence === "low" || item.evidence.length === 0
  );
  const lowConfidenceIssues = keyIssues.some(
    (item) => item.confidence === "low" || (item.evidence.length === 0 && item.key_quotes.length === 0)
  );
  const lowConfidenceAttitudeIntent = [attitudeIntent.counterpart, attitudeIntent.self].some(
    (item) => hasAttitudeIntentContent(item) && (item.confidence === "low" || item.evidence.length === 0)
  );

  return lowConfidenceNeeds || lowConfidenceIssues || lowConfidenceAttitudeIntent;
}

export function flattenInsightTexts(compiledTruth) {
  const latentNeeds = normalizeLatentNeeds(compiledTruth?.latent_needs);
  const keyIssues = normalizeKeyIssues(compiledTruth?.key_issues);
  const attitudeIntent = normalizeAttitudeIntent(compiledTruth?.attitude_intent);
  return [
    ...latentNeeds.counterpart.map((item) => item.need),
    ...latentNeeds.self.map((item) => item.need),
    ...keyIssues.flatMap((item) => [
      item.issue,
      ...item.consensus,
      ...item.non_consensus,
      ...item.key_quotes,
      ...item.evidence
    ]),
    attitudeIntent.counterpart.attitude,
    attitudeIntent.counterpart.intent,
    ...attitudeIntent.counterpart.evidence,
    attitudeIntent.self.attitude,
    attitudeIntent.self.intent,
    ...attitudeIntent.self.evidence
  ].filter((item) => item && !isPlaceholderValue(item));
}

export function hasAttitudeIntentContent(item) {
  return !isPlaceholderValue(item?.attitude) || !isPlaceholderValue(item?.intent);
}

function normalizeNeedItems(values) {
  return firstArray([values])
    .map((item) => normalizeNeedItem(item))
    .filter(Boolean)
    .slice(0, 6);
}

function normalizeNeedItem(item) {
  if (typeof item === "string") {
    const need = normalizeInsightText(item);
    return need ? { need, evidence: [], confidence: "medium" } : null;
  }
  const source = toObject(item);
  const need = firstText([
    source.need,
    source.text,
    source.summary,
    source.label,
    source.value,
    source.description
  ]);
  if (!need) {
    return null;
  }
  return {
    need,
    evidence: normalizeEvidenceList(source.evidence || source.key_evidence || source.quotes),
    confidence: normalizeConfidence(source.confidence)
  };
}

function normalizeKeyIssue(item) {
  if (typeof item === "string") {
    const issue = normalizeInsightText(item);
    return issue
      ? {
          issue,
          consensus: [],
          non_consensus: [],
          key_quotes: [],
          evidence: [],
          confidence: "medium"
        }
      : null;
  }
  const source = toObject(item);
  const issue = firstText([
    source.issue,
    source.topic,
    source.title,
    source.summary,
    source.text,
    source.label
  ]);
  if (!issue) {
    return null;
  }
  const status = normalizeString(source.status || source.state).toLowerCase();
  const evidence = normalizeEvidenceList(source.evidence || source.key_evidence);
  const explicitConsensus = normalizeInsightStringArray(
    source.consensus || source.agreements || source.aligned_points || source.common_ground,
    6
  );
  const explicitNonConsensus = normalizeInsightStringArray(
    source.non_consensus || source.disagreements || source.unresolved || source.differences,
    6
  );
  const explicitKeyQuotes = normalizeInsightStringArray(
    source.key_quotes || source.quotes || source.key_sentences || source.critical_quotes,
    6
  );
  const inferredConsensus = explicitConsensus.length ? explicitConsensus : inferConsensusFromStatus(status, issue, evidence);
  const inferredNonConsensus = explicitNonConsensus.length ? explicitNonConsensus : inferNonConsensusFromStatus(status, issue, evidence);
  return {
    issue,
    consensus: inferredConsensus,
    non_consensus: inferredNonConsensus,
    key_quotes: uniqueStrings([
      ...explicitKeyQuotes,
      ...extractQuotedTexts(evidence)
    ]).slice(0, 6),
    evidence,
    confidence: normalizeConfidence(source.confidence)
  };
}

function normalizeAttitudeIntentSide(value) {
  const source = toObject(value);
  const attitudeObject = toObject(source.attitude);
  return {
    attitude: firstText([source.attitude, source.attitude_label, attitudeObject.label]) || "待判断",
    intent: firstText([source.intent, source.likely_intent, source.goal]) || "待判断",
    evidence: normalizeEvidenceList(source.evidence || source.key_evidence || source.quotes),
    confidence: normalizeConfidence(source.confidence)
  };
}

function mergeNeedItem(previous, incoming) {
  return {
    need: incoming.need || previous.need,
    evidence: uniqueStrings([...previous.evidence, ...incoming.evidence]),
    confidence: chooseConfidence(previous.confidence, incoming.confidence)
  };
}

function mergeKeyIssue(previous, incoming) {
  return {
    issue: incoming.issue || previous.issue,
    consensus: uniqueStrings([...previous.consensus, ...incoming.consensus]),
    non_consensus: uniqueStrings([...previous.non_consensus, ...incoming.non_consensus]),
    key_quotes: uniqueStrings([...previous.key_quotes, ...incoming.key_quotes]),
    evidence: uniqueStrings([...previous.evidence, ...incoming.evidence]),
    confidence: chooseConfidence(previous.confidence, incoming.confidence)
  };
}

function mergeAttitudeIntentSide(previous, incoming) {
  return {
    attitude: isPlaceholderValue(incoming.attitude) ? previous.attitude : incoming.attitude,
    intent: isPlaceholderValue(incoming.intent) ? previous.intent : incoming.intent,
    evidence: uniqueStrings([...previous.evidence, ...incoming.evidence]),
    confidence: chooseConfidence(previous.confidence, incoming.confidence)
  };
}

function mergeByKey(left, right, keyName, mergeItem) {
  const map = new Map();
  [...left, ...right].forEach((item) => {
    const key = normalizeKey(item[keyName]);
    if (!key) {
      return;
    }
    const previous = map.get(key);
    map.set(key, previous ? mergeItem(previous, item) : item);
  });
  return Array.from(map.values());
}

function normalizeConfidence(value) {
  const confidence = normalizeString(value).toLowerCase();
  return CONFIDENCE_ORDER[confidence] ? confidence : "medium";
}

function chooseConfidence(left, right) {
  return CONFIDENCE_ORDER[right] >= CONFIDENCE_ORDER[left] ? right : left;
}

function normalizeEvidenceList(values) {
  return normalizeInsightStringArray(values, 3, 220);
}

function normalizeInsightStringArray(values, limit = 8, maxLength = 180) {
  const items = Array.isArray(values) ? values : (typeof values === "string" ? [values] : []);
  return uniqueStrings(
    items
      .map((item) => normalizeInsightText(item))
      .filter(Boolean)
      .filter((item) => item.length <= maxLength)
      .filter((item) => !/[\\/]/.test(item))
  ).slice(0, limit);
}

function firstArray(values) {
  return values.find((value) => Array.isArray(value)) || [];
}

function firstObject(values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function firstText(values) {
  return values.map((value) => normalizeInsightText(value)).find(Boolean) || "";
}

function inferConsensusFromStatus(status, issue, evidence) {
  if (!statusImpliesConsensus(status)) {
    return [];
  }
  return [firstText([evidence[0], issue])].filter(Boolean);
}

function inferNonConsensusFromStatus(status, issue, evidence) {
  if (!statusImpliesNonConsensus(status)) {
    return [];
  }
  return [firstText([evidence[0], issue])].filter(Boolean);
}

function statusImpliesConsensus(status) {
  const normalized = normalizeString(status).toLowerCase();
  if (!normalized || statusImpliesNonConsensus(normalized)) {
    return false;
  }
  return normalized.includes("consensus")
    || normalized.includes("agreed")
    || normalized.includes("aligned");
}

function statusImpliesNonConsensus(status) {
  const normalized = normalizeString(status).toLowerCase();
  return normalized.includes("non_consensus")
    || normalized.includes("non-consensus")
    || normalized.includes("unresolved")
    || normalized.includes("disagree")
    || normalized.includes("difference");
}

function hasAttitudeIntentShape(source) {
  return Boolean(
    source
      && typeof source === "object"
      && !Array.isArray(source)
      && (
        source.attitude
        || source.attitude_label
        || source.intent
        || source.likely_intent
        || source.goal
        || source.evidence
        || source.key_evidence
        || source.quotes
      )
  );
}

function extractQuotedTexts(values) {
  const texts = Array.isArray(values) ? values : [];
  const quotes = [];
  for (const text of texts) {
    const normalized = normalizeString(text);
    for (const match of normalized.matchAll(/[“"]([^”"]{2,120})[”"]/g)) {
      quotes.push(match[1]);
    }
  }
  return uniqueStrings(quotes);
}

function normalizeInsightText(value) {
  const next = normalizeString(value);
  return isPlaceholderValue(next) ? "" : next;
}

function isPlaceholderValue(value) {
  return PLACEHOLDER_VALUES.has(normalizeString(value).toLowerCase());
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeKey(value) {
  return normalizeString(value).toLowerCase();
}

function uniqueStrings(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
