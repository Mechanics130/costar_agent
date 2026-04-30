// SPDX-License-Identifier: Apache-2.0
import { stableMemoryId } from "./memory-ids.mjs";
import { loadMemoryStore, writeMemoryStore } from "./memory-store.mjs";

export function searchFactsForBriefing({
  storePath,
  personName,
  personRef = "",
  conversationGoal = "",
  limit = 8
} = {}) {
  const memoryStorePath = normalizeString(storePath);
  if (!memoryStorePath) {
    return emptySearchResult();
  }

  const store = loadMemoryStore({ storePath: memoryStorePath });
  const targetEntity = findTargetEntity(store, { personName, personRef });
  if (!targetEntity) {
    return emptySearchResult();
  }

  const sourceById = new Map(normalizeArray(store.sources).map((source) => [source.source_id, source]));
  const scoredFacts = normalizeArray(store.facts)
    .filter((fact) => factMatchesTarget(fact, targetEntity.entity_id))
    .filter((fact) => normalizeString(fact.status) === "active")
    .map((fact) => toBriefingFact(fact, sourceById.get(fact.source_id), conversationGoal))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.fact_id.localeCompare(right.fact_id))
    .slice(0, Math.max(1, Number(limit) || 8));

  return {
    target_entity: summarizeEntity(targetEntity),
    facts_included: scoredFacts
  };
}

export function recordBriefingArtifact({
  storePath,
  targetEntities = [],
  factsIncluded = [],
  artifactPath = "",
  createdAt = ""
} = {}) {
  const memoryStorePath = normalizeString(storePath);
  if (!memoryStorePath) {
    throw new Error("recordBriefingArtifact requires storePath.");
  }

  const processedAt = normalizeString(createdAt) || new Date().toISOString();
  const store = loadMemoryStore({ storePath: memoryStorePath });
  const factIds = uniqueStrings(normalizeArray(factsIncluded).map((fact) => normalizeString(fact.fact_id || fact)).filter(Boolean));
  const sourceRefs = uniqueStrings(
    normalizeArray(factsIncluded)
      .map((fact) => normalizeString(fact.source_id))
      .filter(Boolean)
  );
  const normalizedTargetEntities = uniqueStrings(
    normalizeArray(targetEntities).map((entityId) => normalizeString(entityId)).filter(Boolean)
  );
  const artifact = {
    artifact_id: stableMemoryId("art_briefing", [
      normalizeString(artifactPath) || processedAt,
      normalizedTargetEntities.join("-"),
      factIds.join("-")
    ]),
    artifact_type: "briefing",
    created_at: processedAt,
    target_entities: normalizedTargetEntities,
    facts_included: factIds,
    interactions_included: [],
    source_refs: sourceRefs,
    file_path: normalizeString(artifactPath),
    user_feedback: null
  };

  const factIdSet = new Set(factIds);
  const next = {
    ...store,
    facts: normalizeArray(store.facts).map((fact) => {
      if (!factIdSet.has(fact.fact_id)) {
        return fact;
      }
      const quality = normalizeObject(fact.quality);
      return {
        ...fact,
        quality: {
          ...quality,
          retrieval_count: Number(quality.retrieval_count || 0) + 1,
          last_retrieved_at: processedAt,
          user_marked_useful_count: Number(quality.user_marked_useful_count || 0),
          user_marked_wrong_count: Number(quality.user_marked_wrong_count || 0)
        }
      };
    }),
    artifacts: [...normalizeArray(store.artifacts), artifact]
  };

  const write = writeMemoryStore({
    storePath: memoryStorePath,
    store: next,
    processedAt
  });

  return {
    status: "success",
    memory_store_path: write.store_path,
    artifact,
    memory_store_delta: {
      artifacts_added: 1,
      facts_touched: factIds.length
    }
  };
}

function emptySearchResult() {
  return {
    target_entity: null,
    facts_included: []
  };
}

function findTargetEntity(store, { personName, personRef }) {
  const normalizedRef = normalizeString(personRef).toLowerCase();
  const normalizedName = normalizeString(personName).toLowerCase();
  if (!normalizedName && !normalizedRef) {
    return null;
  }

  return normalizeArray(store.entities).find((entity) => {
    const entityId = normalizeString(entity.entity_id).toLowerCase();
    const canonicalName = normalizeString(entity.canonical_name).toLowerCase();
    const aliases = normalizeArray(entity.aliases).map((alias) => normalizeString(alias).toLowerCase());
    return Boolean(
      (normalizedRef && entityId === normalizedRef)
      || (normalizedName && canonicalName === normalizedName)
      || (normalizedName && aliases.includes(normalizedName))
    );
  }) || null;
}

function factMatchesTarget(fact, entityId) {
  return normalizeString(fact.entity_id) === normalizeString(entityId);
}

function toBriefingFact(fact, source, conversationGoal) {
  const factId = normalizeString(fact.fact_id);
  const value = normalizeString(fact.value);
  if (!factId || !value) {
    return null;
  }
  return {
    fact_id: factId,
    entity_id: normalizeString(fact.entity_id),
    fact_type: normalizeString(fact.fact_type) || "history",
    value,
    confidence: normalizeConfidence(fact.confidence),
    source_id: normalizeString(fact.source_id),
    source_title: normalizeString(source?.source_title),
    source_excerpt: normalizeString(fact.source_excerpt),
    date_observed: normalizeString(fact.date_observed),
    score: scoreFact(fact, conversationGoal)
  };
}

function scoreFact(fact, conversationGoal) {
  const confidence = normalizeConfidence(fact.confidence);
  const quality = normalizeObject(fact.quality);
  const text = [
    fact.fact_type,
    fact.value,
    fact.source_excerpt
  ].map(normalizeString).join(" ");
  const goalTerms = tokenize(conversationGoal);
  const textTerms = new Set(tokenize(text));
  const relevance = goalTerms.filter((term) => textTerms.has(term)).length * 10;
  const confidenceScore = {
    confirmed: 300,
    inferred: 200,
    speculative: 100
  }[confidence];
  const usefulBoost = Number(quality.user_marked_useful_count || 0) * 8;
  const wrongPenalty = Number(quality.user_marked_wrong_count || 0) * 80;
  const retrievalPenalty = Math.min(Number(quality.retrieval_count || 0), 20);
  return confidenceScore + relevance + usefulBoost - wrongPenalty - retrievalPenalty;
}

function tokenize(value) {
  return normalizeString(value)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function summarizeEntity(entity) {
  return {
    entity_id: normalizeString(entity.entity_id),
    entity_type: normalizeString(entity.entity_type) || "person",
    canonical_name: normalizeString(entity.canonical_name),
    aliases: normalizeArray(entity.aliases).map(normalizeString).filter(Boolean)
  };
}

function normalizeConfidence(value) {
  const normalized = normalizeString(value);
  return ["confirmed", "inferred", "speculative"].includes(normalized) ? normalized : "inferred";
}

function uniqueStrings(values) {
  return Array.from(new Set(values));
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeString(value) {
  return String(value ?? "").trim();
}
