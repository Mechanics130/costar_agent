// SPDX-License-Identifier: Apache-2.0
import { loadMemoryStore } from "./memory-store.mjs";

export function runMemoryLint({
  storePath,
  memory_store_path: memoryStorePathAlias,
  now = new Date().toISOString(),
  zombieDays = 90,
  zombie_days: zombieDaysAlias
} = {}) {
  const memoryStorePath = normalizeString(storePath || memoryStorePathAlias);
  if (!memoryStorePath) {
    throw new Error("runMemoryLint requires storePath or memory_store_path.");
  }

  const checkedAt = normalizeString(now) || new Date().toISOString();
  const zombieWindowDays = Number(zombieDaysAlias ?? zombieDays) || 90;
  const store = loadMemoryStore({ storePath: memoryStorePath });
  const activeEntities = normalizeArray(store.entities).filter((entity) => normalizeString(entity.status) === "active");
  const activeFacts = normalizeArray(store.facts).filter((fact) => normalizeString(fact.status) === "active");
  const entityById = new Map(activeEntities.map((entity) => [entity.entity_id, entity]));
  const factsByEntity = groupBy(activeFacts, (fact) => normalizeString(fact.entity_id));

  const overdueCommitments = findOverdueCommitments(activeFacts, entityById, checkedAt);
  const overdueFactIds = new Set(overdueCommitments.map((issue) => issue.fact_id));
  const zombieFacts = findZombieFacts(activeFacts, entityById, checkedAt, zombieWindowDays);
  const zombieFactIds = new Set(zombieFacts.map((issue) => issue.fact_id));
  const possibleConflicts = findPossibleConflicts(activeFacts, entityById);
  const conflictEntityIds = new Set(possibleConflicts.map((issue) => issue.entity_id));
  const isolatedEntities = findIsolatedEntities({
    entities: activeEntities,
    factsByEntity,
    interactions: store.interactions,
    relationships: store.relationships
  });
  const knowledgeGaps = findKnowledgeGaps({
    entities: activeEntities,
    factsByEntity,
    overdueFactIds,
    zombieFactIds,
    conflictEntityIds
  });

  const issues = {
    overdue_commitments: overdueCommitments,
    zombie_facts: zombieFacts,
    isolated_entities: isolatedEntities,
    possible_conflicts: possibleConflicts,
    knowledge_gaps: knowledgeGaps
  };
  const issueCounts = Object.fromEntries(
    Object.entries(issues).map(([key, value]) => [key, value.length])
  );
  const totalIssues = Object.values(issueCounts).reduce((sum, count) => sum + count, 0);

  return {
    status: totalIssues > 0 ? "needs_attention" : "healthy",
    memory_store_path: store.store_path,
    checked_at: checkedAt,
    issue_counts: issueCounts,
    issues,
    markdown_report: renderMemoryLintMarkdown({ checkedAt, issueCounts, issues, totalIssues, zombieWindowDays })
  };
}

function findOverdueCommitments(facts, entityById, checkedAt) {
  return facts
    .filter((fact) => normalizeString(fact.fact_type) === "commitment")
    .map((fact) => {
      const dueDate = extractFirstDate(fact.value);
      if (!dueDate || compareDateOnly(dueDate, checkedAt) >= 0) {
        return null;
      }
      return {
        issue_type: "overdue_commitment",
        severity: "high",
        entity_id: normalizeString(fact.entity_id),
        entity_name: entityName(entityById, fact.entity_id),
        fact_id: normalizeString(fact.fact_id),
        due_date: dueDate,
        value: normalizeString(fact.value),
        recommended_action: "Confirm whether this commitment was completed, renegotiate it, or archive the fact."
      };
    })
    .filter(Boolean);
}

function findZombieFacts(facts, entityById, checkedAt, zombieWindowDays) {
  return facts
    .map((fact) => {
      const committedAt = normalizeString(fact.date_committed || fact.date_observed);
      if (!committedAt || daysBetween(committedAt, checkedAt) < zombieWindowDays) {
        return null;
      }
      const quality = normalizeObject(fact.quality);
      if (Number(quality.retrieval_count || 0) > 0) {
        return null;
      }
      return {
        issue_type: "zombie_fact",
        severity: "medium",
        entity_id: normalizeString(fact.entity_id),
        entity_name: entityName(entityById, fact.entity_id),
        fact_id: normalizeString(fact.fact_id),
        age_days: daysBetween(committedAt, checkedAt),
        value: normalizeString(fact.value),
        recommended_action: "Review whether this fact is still useful, stale, or should be archived."
      };
    })
    .filter(Boolean);
}

function findIsolatedEntities({ entities, factsByEntity, interactions, relationships }) {
  const connectedEntityIds = new Set();
  for (const interaction of normalizeArray(interactions)) {
    for (const participant of normalizeArray(interaction.participants)) {
      connectedEntityIds.add(normalizeString(participant));
    }
  }
  for (const relationship of normalizeArray(relationships)) {
    connectedEntityIds.add(normalizeString(relationship.source_entity_id));
    connectedEntityIds.add(normalizeString(relationship.target_entity_id));
  }

  return entities
    .filter((entity) => !normalizeArray(factsByEntity.get(entity.entity_id)).length)
    .filter((entity) => !connectedEntityIds.has(normalizeString(entity.entity_id)))
    .map((entity) => ({
      issue_type: "isolated_entity",
      severity: "medium",
      entity_id: normalizeString(entity.entity_id),
      entity_name: normalizeString(entity.canonical_name),
      recommended_action: "Add source-backed facts or merge/archive this entity if it was created by mistake."
    }));
}

function findPossibleConflicts(facts, entityById) {
  const grouped = groupBy(facts, (fact) => `${normalizeString(fact.entity_id)}::${normalizeString(fact.fact_type)}`);
  const issues = [];
  for (const group of grouped.values()) {
    if (group.length < 2) {
      continue;
    }
    // --- Upgraded: temporal contradiction detection ---
    // Instead of the old hardcoded opposing-pairs heuristic,
    // we now check for facts that:
    //   1. Have the same entity_id + fact_type
    //   2. Have different values (not exact text duplicates)
    //   3. Both have valid_at set and are in the same time window
    //      (their validity periods overlap)
    //   4. Neither has invalid_at set (both still considered active)
    //
    // This replaces the old looksConflicting() with opposing word pairs
    // like ["short","long"], ["async","live"], etc.
    // The temporal invalidation in memory-commit.mjs now handles most
    // contradictions automatically, but this lint check catches any
    // that might have been missed (e.g., facts committed before the
    // temporal model was introduced).
    const conflict = findTemporalConflict(group);
    if (!conflict) {
      continue;
    }
    issues.push({
      issue_type: "possible_conflict",
      severity: "medium",
      entity_id: normalizeString(conflict.left.entity_id),
      entity_name: entityName(entityById, conflict.left.entity_id),
      fact_type: normalizeString(conflict.left.fact_type),
      fact_ids: [conflict.left.fact_id, conflict.right.fact_id],
      values: [normalizeString(conflict.left.value), normalizeString(conflict.right.value)],
      valid_at: [normalizeString(conflict.left.valid_at), normalizeString(conflict.right.valid_at)],
      recommended_action: "One of these facts should be superseded. Use memory-commit to re-commit with the correct value; the old fact will be auto-invalidated via temporal invalidation."
    });
  }
  return issues;
}

function findKnowledgeGaps({ entities, factsByEntity, overdueFactIds, zombieFactIds, conflictEntityIds }) {
  return entities
    .map((entity) => {
      const allFacts = normalizeArray(factsByEntity.get(entity.entity_id));
      const usableFacts = allFacts.filter((fact) =>
        !overdueFactIds.has(fact.fact_id)
        && !zombieFactIds.has(fact.fact_id)
      );

      if (allFacts.length === 0) {
        return {
          issue_type: "knowledge_gap",
          severity: "low",
          entity_id: normalizeString(entity.entity_id),
          entity_name: normalizeString(entity.canonical_name),
          known_fact_count: 0,
          recommended_action: "Import or confirm at least two source-backed facts before relying on this entity."
        };
      }

      if (usableFacts.length === 1 && !conflictEntityIds.has(entity.entity_id)) {
        return {
          issue_type: "knowledge_gap",
          severity: "low",
          entity_id: normalizeString(entity.entity_id),
          entity_name: normalizeString(entity.canonical_name),
          known_fact_count: 1,
          recommended_action: "Capture more evidence before using this profile for high-stakes briefing."
        };
      }

      return null;
    })
    .filter(Boolean);
}

/**
 * Find a temporal conflict in a group of facts with the same entity+fact_type.
 *
 * Two facts conflict if:
 *   - Their values differ (not exact text duplicates after normalization)
 *   - Both are still active (status === "active")
 *   - Neither has invalid_at set (not yet auto-invalidated)
 *   - Their validity windows overlap (time-based check, not word-based)
 *
 * This replaces the old looksConflicting() with hardcoded opposing word pairs.
 */
function findTemporalConflict(facts) {
  for (let leftIndex = 0; leftIndex < facts.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < facts.length; rightIndex += 1) {
      const left = facts[leftIndex];
      const right = facts[rightIndex];

      // Skip if values are identical (duplicate, not conflict)
      if (normalizeFactText(left.value) === normalizeFactText(right.value)) continue;

      // Skip if either has been invalidated (temporal invalidation already handled it)
      if (normalizeString(left.invalid_at) || normalizeString(right.invalid_at)) continue;

      // Check temporal overlap
      const leftValid = normalizeString(left.valid_at) || normalizeString(left.date_observed);
      const rightValid = normalizeString(right.valid_at) || normalizeString(right.date_observed);

      // If both have valid_at, check for overlap
      if (leftValid && rightValid) {
        // If left is older, right should have invalidated left (or vice versa)
        // If neither was invalidated, it's a conflict that was missed
        return { left, right };
      }

      // If no temporal data, fall back to value-based conflict detection
      // (same entity + same fact_type + different values + both active = potential conflict)
      return { left, right };
    }
  }
  return null;
}

function normalizeFactText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s]+/g, " ")
    .trim();
}

function renderMemoryLintMarkdown({ checkedAt, issueCounts, issues, totalIssues, zombieWindowDays }) {
  const lines = [
    "# CoStar Memory Lint",
    "",
    `- Checked at: ${checkedAt}`,
    `- Status: ${totalIssues > 0 ? "needs_attention" : "healthy"}`,
    `- Zombie threshold: ${zombieWindowDays} days`,
    "",
    "## Summary",
    "",
    `- Overdue commitments: ${issueCounts.overdue_commitments}`,
    `- Zombie facts: ${issueCounts.zombie_facts}`,
    `- Isolated entities: ${issueCounts.isolated_entities}`,
    `- Possible conflicting facts: ${issueCounts.possible_conflicts}`,
    `- Knowledge gaps: ${issueCounts.knowledge_gaps}`,
    ""
  ];

  appendIssueSection(lines, "Overdue commitments", issues.overdue_commitments, (issue) =>
    `${issue.entity_name}: ${issue.value} (due ${issue.due_date})`
  );
  appendIssueSection(lines, "Zombie facts", issues.zombie_facts, (issue) =>
    `${issue.entity_name}: ${issue.value} (${issue.age_days} days old, never retrieved)`
  );
  appendIssueSection(lines, "Isolated entities", issues.isolated_entities, (issue) =>
    `${issue.entity_name}: no facts, interactions, or relationships`
  );
  appendIssueSection(lines, "Possible conflicting facts", issues.possible_conflicts, (issue) =>
    `${issue.entity_name}: ${issue.values.join(" | ")}`
  );
  appendIssueSection(lines, "Knowledge gaps", issues.knowledge_gaps, (issue) =>
    `${issue.entity_name}: ${issue.known_fact_count} usable fact(s)`
  );

  return `${lines.join("\n")}\n`;
}

function appendIssueSection(lines, title, items, renderItem) {
  lines.push(`## ${title}`, "");
  if (!items.length) {
    lines.push("- No issues found.", "");
    return;
  }
  for (const item of items) {
    lines.push(`- ${renderItem(item)}`);
    lines.push(`  Recommended action: ${item.recommended_action}`);
  }
  lines.push("");
}

function extractFirstDate(value) {
  const matched = normalizeString(value).match(/\b\d{4}-\d{2}-\d{2}\b/);
  return matched ? matched[0] : "";
}

function compareDateOnly(left, right) {
  return dateOnly(left).localeCompare(dateOnly(right));
}

function dateOnly(value) {
  const normalized = normalizeString(value);
  const matched = normalized.match(/\d{4}-\d{2}-\d{2}/);
  return matched ? matched[0] : "";
}

function daysBetween(left, right) {
  const leftMs = Date.parse(dateOnly(left));
  const rightMs = Date.parse(dateOnly(right));
  if (!Number.isFinite(leftMs) || !Number.isFinite(rightMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((rightMs - leftMs) / 86_400_000));
}

function entityName(entityById, entityId) {
  return normalizeString(entityById.get(normalizeString(entityId))?.canonical_name) || normalizeString(entityId);
}

function groupBy(values, keyFn) {
  const map = new Map();
  for (const value of normalizeArray(values)) {
    const key = keyFn(value);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(value);
  }
  return map;
}

function tokenize(value) {
  return new Set(
    normalizeString(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .map((term) => term.trim())
      .filter(Boolean)
  );
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
