// SPDX-License-Identifier: Apache-2.0
/**
 * Embedding utilities for semantic fact retrieval and entity dedup.
 *
 * Design principles (borrowed from Graphiti's Context Graph):
 * - Graceful degradation: if no API key or embedding service is unavailable,
 *   all functions return null / fall back to keyword-only search.
 * - No hard dependency on any specific embedding provider.
 * - Cosine similarity and RRF fusion are pure math, zero external calls.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS) || 1536;

/**
 * Generate an embedding vector for the given text.
 * Returns null if no API key is configured or the request fails.
 *
 * @param {string} text
 * @returns {Promise<number[] | null>}
 */
export async function generateEmbedding(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  if (!OPENAI_API_KEY) return null;

  try {
    const res = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: trimmed,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!res.ok) {
      console.warn(`[embedding-utils] Embedding API returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const embedding = data?.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch (err) {
    console.warn(`[embedding-utils] Embedding generation failed: ${err.message}`);
    return null;
  }
}

/**
 * Compute cosine similarity between two vectors.
 * Returns 0 if either vector is null/empty or lengths don't match.
 *
 * @param {number[] | null} a
 * @param {number[] | null} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Reciprocal Rank Fusion (RRF) — merges multiple ranked result lists
 * into a single ranking without needing score calibration.
 *
 * This is the same algorithm used by Graphiti's default search recipe
 * (COMBINED_HYBRID_SEARCH_RRF). Each list contributes 1/(k + rank)
 * to each item's fused score.
 *
 * @param {Array<Array<{item: object, id: string}>>} rankedLists - multiple ranked result lists
 * @param {number} k - RRF constant (default 60, standard value)
 * @returns {Array<object>} - fused and re-ranked items
 */
export function rrfFusion(rankedLists, k = 60) {
  if (!Array.isArray(rankedLists) || rankedLists.length === 0) return [];

  const scores = new Map();

  for (const list of rankedLists) {
    if (!Array.isArray(list)) continue;
    for (let rank = 0; rank < list.length; rank++) {
      const entry = list[rank];
      if (!entry || !entry.id) continue;
      const current = scores.get(entry.id) || { score: 0, item: entry.item };
      current.score += 1 / (k + rank + 1);
      scores.set(entry.id, current);
    }
  }

  return [...scores.entries()]
    .sort(([, a], [, b]) => b.score - a.score)
    .map(([id, { score, item }]) => ({ ...item, _rrf_score: score, _id: id }));
}

/**
 * Check whether embeddings are available (API key configured).
 * Used by retrieval to decide between hybrid vs keyword-only search.
 *
 * @returns {boolean}
 */
export function embeddingsAvailable() {
  return Boolean(OPENAI_API_KEY);
}
