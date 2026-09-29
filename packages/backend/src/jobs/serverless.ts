// One bounded cloud invocation: acquire a lease, collect, drain existing handlers, then release pools.
import type { PgBoss } from "pg-boss";
import { DEMAND_VERSION } from "../editorial/demand.ts";
import { FEATURES } from "@aihot/industry/features";
import { publishArticle } from "../publication/publish.ts";
import { COLLECTION } from "@aihot/industry/collection";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { withinDeadline, invocationSignal } from "../lib/deadline.ts";
import { collectSource, type CollectResult } from "../sources/collect.ts";
import { registerContentJobs, registerExtractionJobs, sweepUnprocessed } from "./content.ts";
import { registerEventJobs } from "./events.ts";
import { registerPublicationJobs } from "./publication.ts";
import { markStalePendingReceipts } from "../providers/receipts.ts";
import { autoReleaseUnknownReceipts } from "../admin/runs.ts";
import { computeHotRanking } from "../events/hot.ts";
import { getBoss, pauseBoss, recordRun } from "./queue.ts";

const LEASE = "vercel.collection";

/** UTC slots begin at 04, 10, 16 and 22, corresponding to six-hourly UTC+8 slots. */
export function collectionSlot(now = Date.now()): string {
  return String(Math.floor((now - 4 * 3600_000) / (6 * 3600_000)));
}

interface BatchOptions {
  slot?: string;
  sourceIds?: string[];
  seconds?: number;
  databaseLimitBytes?: number;
}

export async function runCollectionBatch(options: BatchOptions = {}) {
  const [storage] = await sql<{ bytes: number }[]>`SELECT pg_database_size(current_database())::bigint AS bytes`;
  if (storage!.bytes >= (options.databaseLimitBytes ?? COLLECTION.databaseLimitBytes)) return { status: "storage-limit" as const, databaseBytes: storage!.bytes };
  const slot = options.slot ?? collectionSlot();
  const started = Date.now();
  const seconds = Math.min(COLLECTION.runSeconds, Math.max(1, options.seconds ?? COLLECTION.runSeconds));
  const lease = { slot, status: "running", expiresAt: new Date(started + 300_000).toISOString() };
  const claimed = await sql`INSERT INTO settings (key, value, updated_by) VALUES (${LEASE}, ${sql.json(lease)}, 'vercel-cron')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE (settings.value->>'expiresAt')::timestamptz <= now()
      AND NOT (settings.value->>'slot' = ${slot} AND settings.value->>'status' = 'done') RETURNING key`;
  if (!claimed.length) return { status: "skipped" as const, reason: "duplicate-or-running" };

  try {
    const result = await recordRun("vercel.collect", () => withinDeadline(seconds * 1000, async () => {
      const collected: CollectResult[] = [];
      // Restore old unprojected material without requiring a model key. Bounded and resumable.
      if (FEATURES.flatFeed) {
        const pending = await sql<{ id: string }[]>`SELECT a.id FROM articles a LEFT JOIN publications p ON p.article_id=a.id
          WHERE p.article_id IS NULL OR p.category IS NOT NULL OR p.selected OR cardinality(p.tags)>0
            OR (p.score IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analyses an WHERE an.id=p.analysis_id AND an.output->'demand'->>'version'=${DEMAND_VERSION}))
          ORDER BY a.discovered_at DESC LIMIT 500`;
        for (const row of pending) {
          if (invocationSignal()?.aborted) break;
          await publishArticle(row.id);
        }
      }
      // A healthy source is read in every slot even when Hobby's previous invocation ran late.
      // An upstream's error/rate-limit delay still takes precedence.
      const scope = options.sourceIds === undefined ? sql`true` : options.sourceIds.length ? sql`id IN ${sql(options.sourceIds)}` : sql`false`;
      const sources = await sql<{ id: string }[]>`SELECT id FROM sources WHERE enabled
        AND kind IN ('rss', 'web_list', 'json_list') AND ${scope}
        AND (health NOT IN ('degraded', 'failing') OR next_fetch_at <= now()) ORDER BY id`;
      for (const source of sources) {
        if (invocationSignal()?.aborted) break;
        collected.push(await collectSource(source.id));
      }

      const handlers = new Map<string, (jobs: any[]) => Promise<unknown>>();
      // Register the same business handlers as the regular worker, without creating polling loops.
      const registry: Pick<PgBoss, "work"> = {
        work: async (name: string, ...args: any[]) => { handlers.set(name, args.at(-1)); return name; },
      };
      let processed = 0;
      if (!invocationSignal()?.aborted) {
        await registerPublicationJobs(registry);
        if (config.modelCallsEnabled) {
          await registerContentJobs(registry);
          await registerExtractionJobs(registry);
          if (!FEATURES.flatFeed) await registerEventJobs(registry);
          await markStalePendingReceipts();
          await autoReleaseUnknownReceipts();
          await sweepUnprocessed();
        }
        const boss = await getBoss();
        await boss.supervise();
        for (let round = 0; round < 50 && !invocationSignal()?.aborted; round += 1) {
          let found = false;
          for (const [name, handler] of handlers) {
            if (invocationSignal()?.aborted) break;
            const jobs = await boss.fetch(name, { batchSize: 1 });
            if (!jobs.length) continue;
            found = true;
            try {
              const output = await handler(jobs);
              await boss.complete(name, jobs[0]!.id, output && typeof output === "object" ? output : null);
            } catch {
              await boss.fail(name, jobs[0]!.id, { error: "Bounded worker interrupted or handler failed; inspect the operation record" });
            }
            processed += 1;
          }
          if (!found) break;
        }
      }
      if (!FEATURES.flatFeed && config.modelCallsEnabled && !invocationSignal()?.aborted) await computeHotRanking();
      return {
        status: collected.some((r) => r.status === "failed") || invocationSignal()?.aborted ? "partial" as const : "ok" as const,
        slot, collected, processed, modelProcessingEnabled: config.modelCallsEnabled, elapsedMs: Date.now() - started,
      };
    }));
    await sql`UPDATE settings SET value = ${sql.json({ slot, status: "done", expiresAt: new Date(0).toISOString(), result: { ...result, collected: result.collected.map((r) => ({ ...r })) } })}, updated_at = now()
      WHERE key = ${LEASE} AND value->>'slot' = ${slot}`;
    return result;
  } catch (error) {
    await sql`UPDATE settings SET value = ${sql.json({ slot, status: "failed", expiresAt: new Date(0).toISOString() })}, updated_at = now()
      WHERE key = ${LEASE} AND value->>'slot' = ${slot}`;
    throw error;
  } finally {
    await pauseBoss();
  }
}
