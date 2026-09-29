// Failure cases: seed intervals stay hourly, or daily adaptation silently accelerates free-tier collection.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { REPO_ROOT } from "@aihot/backend/config";
import { sql, closeDb } from "@aihot/backend/db";
import { adaptIntervals } from "@aihot/backend/sources/collect";
import { COLLECTION } from "@aihot/industry/collection";

after(closeDb);

test("every active source is seeded at the six-hour collection interval", () => {
  const { sources } = JSON.parse(readFileSync(`${REPO_ROOT}/industry/sources.json`, "utf8"));
  assert.equal(COLLECTION.minimumIntervalMinutes, 360);
  for (const source of sources.filter((s: { enabled: boolean }) => s.enabled)) assert.equal(source.interval_minutes, 360, source.id);
  assert.deepEqual(COLLECTION.utcSchedules, ["0 16 * * *", "0 22 * * *", "0 4 * * *", "0 10 * * *"]);
});

test("automatic interval adaptation never shortens the configured six-hour floor", async () => {
  const id = `cadence-${tag()}`;
  await sql`INSERT INTO sources (id, name, kind, config, interval_minutes, enabled, next_fetch_at)
    VALUES (${id}, 'Cadence test', 'rss', '{}'::jsonb, 15, true, '2100-01-01')`;
  await adaptIntervals();
  const [source] = await sql`SELECT interval_minutes FROM sources WHERE id = ${id}`;
  assert.equal(source!.interval_minutes, 360);
  await sql`UPDATE sources SET enabled = false WHERE id = ${id}`;
});
