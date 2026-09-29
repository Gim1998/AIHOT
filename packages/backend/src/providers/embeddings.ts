// Stored-vector compatibility only. No external embedding API.
import { sql } from "../db.ts";
import { sha256 } from "../lib/ids.ts";

// Historical vectors may still be read, but no embedding service is configured or called.
export const EMBEDDING_MODEL = "text-embedding-v4";

// Recall reads fresh fact/story titles on every call, so the full text hash also invalidates this
// cache when either title changes. Keep enough entries for the 4,000-fact recall window, not the
// unbounded article history. Expiry also picks up a stored-vector repair with an unchanged hash.
const FACT_CACHE_LIMIT = 4096;
const FACT_CACHE_TTL_MS = 5 * 60_000;
const factVectors = new Map<string, { textHash: string; vector: number[]; expiresAt: number }>();

function cacheFact(id: string, textHash: string, vector: number[]) {
  factVectors.delete(id);
  factVectors.set(id, { textHash, vector, expiresAt: Date.now() + FACT_CACHE_TTL_MS });
  if (factVectors.size > FACT_CACHE_LIMIT) factVectors.delete(factVectors.keys().next().value!);
}

/** DeepSeek has no embeddings endpoint. Event grouping uses its existing lexical/link fallback. */
export function embeddingsAvailable(): boolean { return false; }

/** Reads historical embeddings only; missing vectors never trigger another provider. */
export async function ensureEmbeddings(kind: "fact" | "article" | "story", items: Array<{ id: string; text: string }>): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (items.length === 0) return out;
  const hashes = new Map(items.map((item) => [item.id, sha256(item.text)]));
  const now = Date.now();
  const uncached = items.filter((item) => {
    const hit = kind === "fact" ? factVectors.get(item.id) : undefined;
    if (!hit) return true;
    if (hit.textHash !== hashes.get(item.id) || hit.expiresAt <= now) {
      factVectors.delete(item.id);
      return true;
    }
    // Refresh recency, but not expiry: repeated access must not conceal a stored-vector repair.
    factVectors.delete(item.id);
    factVectors.set(item.id, hit);
    out.set(item.id, hit.vector);
    return false;
  });
  const rows = uncached.length ? await sql<{ ref_id: string; text_hash: string; vector: number[] }[]>`
    SELECT ref_id, text_hash, vector FROM embeddings WHERE kind = ${kind} AND model = ${EMBEDDING_MODEL} AND ref_id IN ${sql(uncached.map((i) => i.id))}` : [];
  const have = new Map(rows.map((r) => [r.ref_id, r]));
  for (const i of uncached) {
    const h = have.get(i.id);
    if (h && h.text_hash === hashes.get(i.id)) {
      out.set(i.id, h.vector);
      if (kind === "fact") cacheFact(i.id, h.text_hash, h.vector);
    }
  }
  return out;
}
