// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEmptyMemoryStore,
  loadMemoryStore,
  writeMemoryStore
} from "./memory-store.mjs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "costar-memory-store-"));

try {
  const storePath = path.join(tmp, "memory-store.json");
  const empty = createEmptyMemoryStore("0.3.0");
  assert.equal(empty.version, "0.3.0");
  assert.deepEqual(empty.facts, []);

  const loaded = loadMemoryStore({ storePath });
  assert.equal(loaded.store_path, storePath);
  assert.deepEqual(loaded.entities, []);

  const written = writeMemoryStore({
    storePath,
    store: {
      ...empty,
      updated_at: "2026-04-30T00:00:00.000Z",
      sources: [{
        source_id: "src_test",
        source_type: "meeting_note",
        source_title: "Mock note",
        ingested_at: "2026-04-30T00:00:00.000Z",
        privacy_level: "normal",
        retention_policy: "metadata_only"
      }]
    }
  });

  assert.equal(written.written, true);
  assert.equal(written.store_path, storePath);
  assert.deepEqual(written.counts, {
    sources: 1,
    entities: 0,
    candidates: 0,
    facts: 0,
    interactions: 0,
    relationships: 0,
    artifacts: 0
  });
  assert.equal(loadMemoryStore({ storePath }).sources[0].source_id, "src_test");
  console.log("memory-store-smoke passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
