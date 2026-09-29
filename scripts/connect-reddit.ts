// Preview the four configured Reddit communities; --apply enables them only after all return posts.
// node --env-file=.env scripts/connect-reddit.ts [--apply]
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { previewSource } from "@aihot/backend/admin/sources";
import type { SourceRow } from "@aihot/backend/sources/types";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
const { sources } = JSON.parse(readFileSync(`${REPO_ROOT}/industry/sources.json`, "utf8")) as { sources: SourceRow[] };
// Preserve the original IDs when migrating RSS records, so there is never a second Reddit source.
const reddit = sources.filter((source) => source.id.startsWith("rss-reddit-") && source.kind === "json_list");
if (reddit.length !== 4) throw new Error("Expected the four Reddit sources in industry/sources.json");

try {
  for (const source of reddit) {
    const preview = await previewSource(source);
    if (!preview.count) throw new Error(`${source.id}: Reddit returned no posts; nothing was enabled`);
    console.log(JSON.stringify({ sourceId: source.id, count: preview.count, samples: preview.items.slice(0, 2) }));
  }
  if (values.apply) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for --apply");
    await sql.begin(async (tx) => {
      for (const source of reddit) {
        const [before] = await tx`SELECT id, kind, config, enabled FROM sources WHERE id = ${source.id} FOR UPDATE`;
        const name = source.name.replace(/（OAuth 待验证）$/, "");
        await tx`INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, tags, enabled, next_fetch_at)
          VALUES (${source.id}, ${name}, 'json_list', ${tx.json(source.config)}, 'T2', 'editorial', ${source.interval_minutes}, ${["英语", "需求观察", "社区"]}, true, now())
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind, config = EXCLUDED.config,
            enabled = true, interval_minutes = EXCLUDED.interval_minutes, health = 'unknown', fail_count = 0, last_error = NULL,
            cursor = CASE WHEN sources.kind IS DISTINCT FROM EXCLUDED.kind OR sources.config IS DISTINCT FROM EXCLUDED.config THEN NULL ELSE sources.cursor END,
            next_fetch_at = now(), updated_at = now()`;
        await tx`INSERT INTO audit_log (actor, action, subject, reason, before, after)
          VALUES ('connect-reddit', 'source.connect', ${`source:${source.id}`}, 'Official OAuth preview succeeded for all four communities',
            ${before ? tx.json(before) : null}, ${tx.json({ kind: "json_list", config: source.config, enabled: true })})`;
      }
    });
    console.log("Reddit: 4 sources enabled");
  } else {
    console.log("Preview only; use --apply with DATABASE_URL to enable these sources in an existing instance");
  }
} finally {
  await closeDb();
}
