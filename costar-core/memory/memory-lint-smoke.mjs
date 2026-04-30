// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runHostModelTool } from "../tools/host-model-dispatcher.mjs";
import { createEmptyMemoryStore, writeMemoryStore } from "./memory-store.mjs";
import { runMemoryLint } from "./memory-lint.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-lint-"));

try {
  const memoryStorePath = path.join(tmp, "memory-store.json");
  const store = createEmptyMemoryStore();
  store.entities.push(
    makeEntity("ent_riley", "Riley Chen"),
    makeEntity("ent_ava", "Ava Patel"),
    makeEntity("ent_jordan", "Jordan Kim"),
    makeEntity("ent_casey", "Casey Park"),
    makeEntity("ent_morgan", "Morgan Lee")
  );
  store.facts.push(
    makeFact({
      fact_id: "fact_overdue_commitment",
      entity_id: "ent_riley",
      fact_type: "commitment",
      value: "Riley promised to send the final rollout plan by 2026-01-10.",
      date_committed: "2026-01-05T00:00:00.000Z",
      retrieval_count: 4
    }),
    makeFact({
      fact_id: "fact_zombie_history",
      entity_id: "ent_ava",
      fact_type: "history",
      value: "Ava joined the early pilot planning thread.",
      date_committed: "2025-09-01T00:00:00.000Z",
      retrieval_count: 0
    }),
    makeFact({
      fact_id: "fact_casey_style",
      entity_id: "ent_casey",
      fact_type: "style",
      value: "Casey prefers concise updates.",
      date_committed: "2026-04-20T00:00:00.000Z",
      retrieval_count: 1
    }),
    makeFact({
      fact_id: "fact_morgan_short",
      entity_id: "ent_morgan",
      fact_type: "preference",
      value: "Morgan prefers short async updates.",
      date_committed: "2026-04-20T00:00:00.000Z",
      retrieval_count: 1
    }),
    makeFact({
      fact_id: "fact_morgan_long",
      entity_id: "ent_morgan",
      fact_type: "preference",
      value: "Morgan prefers long live review meetings.",
      date_committed: "2026-04-21T00:00:00.000Z",
      retrieval_count: 1
    })
  );
  writeMemoryStore({ storePath: memoryStorePath, store });

  const report = runMemoryLint({
    storePath: memoryStorePath,
    now: "2026-04-30T00:00:00.000Z",
    zombieDays: 90
  });

  assert.equal(report.status, "needs_attention");
  assert.equal(report.issue_counts.overdue_commitments, 1);
  assert.equal(report.issue_counts.zombie_facts, 1);
  assert.equal(report.issue_counts.isolated_entities, 1);
  assert.equal(report.issue_counts.possible_conflicts, 1);
  assert.equal(report.issue_counts.knowledge_gaps, 2);
  assert.match(report.markdown_report, /Overdue commitments/);
  assert.match(report.markdown_report, /Zombie facts/);
  assert.match(report.markdown_report, /Isolated entities/);
  assert.match(report.markdown_report, /Possible conflicting facts/);
  assert.match(report.markdown_report, /Knowledge gaps/);

  const dispatcherReport = runHostModelTool({
    tool_name: "memory_lint",
    tool_input: {
      memory_store_path: memoryStorePath,
      now: "2026-04-30T00:00:00.000Z",
      zombie_days: 90
    }
  });
  assert.equal(dispatcherReport.issue_counts.zombie_facts, 1);

  const cli = spawnSync(process.execPath, [
    path.join(repoRoot, "bin", "costar.mjs"),
    "memory",
    "lint",
    "--store",
    memoryStorePath,
    "--now",
    "2026-04-30T00:00:00.000Z",
    "--zombie-days",
    "90"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /CoStar Memory Lint/);
  assert.match(cli.stdout, /Overdue commitments/);

  console.log("memory-lint-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

function makeEntity(entityId, canonicalName) {
  return {
    entity_id: entityId,
    entity_type: "person",
    canonical_name: canonicalName,
    aliases: [],
    key_attributes: {},
    first_seen_at: "2026-04-01T00:00:00.000Z",
    last_updated_at: "2026-04-01T00:00:00.000Z",
    status: "active",
    merged_into: null
  };
}

function makeFact({
  fact_id,
  entity_id,
  fact_type,
  value,
  date_committed,
  retrieval_count
}) {
  return {
    fact_id,
    entity_id,
    fact_type,
    value,
    confidence: "confirmed",
    source_id: "src_mock",
    source_excerpt: value,
    date_observed: date_committed.slice(0, 10),
    date_committed,
    status: "active",
    superseded_by: null,
    review: {
      reviewed_by: "smoke-test",
      reviewed_at: date_committed,
      decision: "accepted",
      notes: ""
    },
    quality: {
      retrieval_count,
      last_retrieved_at: retrieval_count > 0 ? "2026-04-25T00:00:00.000Z" : null,
      user_marked_useful_count: 0,
      user_marked_wrong_count: 0
    }
  };
}
