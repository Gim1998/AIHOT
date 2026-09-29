// Failure cases: a legacy source is seeded again, an unavailable source starts polling,
// last-reply dates turn old questions into news, or repeated collection duplicates a thread.
// The real collectors read local HTTP fixtures and write to the disposable test database.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { after, test } from "node:test";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { assertSupportedConfig } from "@aihot/backend/sources/config-keys";
import { collectSource } from "@aihot/backend/sources/collect";
import type { SourceRow } from "@aihot/backend/sources/types";

const { sources } = JSON.parse(readFileSync(`${REPO_ROOT}/industry/sources.json`, "utf8")) as {
  sources: Array<SourceRow & { site_fulltext: boolean; syndicate_fulltext: boolean }>;
};
const T = tag();
const started = new Date(Date.now() - 96 * 3600_000);
started.setMilliseconds(0);
let requests = 0;
const server = http.createServer((req, res) => {
  requests += 1;
  const source = sources.find((s) => `/${s.id}` === req.url);
  if (!source || !source.enabled) { res.writeHead(404).end(); return; }
  const prefix = source.config.allowUrlPrefixes[0];
  const url = `${prefix}workflow-${source.id}-${T}/`;
  res.setHeader("content-type", source.kind === "json_list" ? "application/json" : source.kind === "rss" ? "application/rss+xml" : "text/html");
  if (source.kind === "json_list") {
    const post = { kind: "t3", data: { title: `Client workflow ${T}`, selftext: "Clients send documents out of order.", permalink: new URL(url).pathname, created_utc: started.getTime() / 1000 } };
    res.end(JSON.stringify({ data: { children: [post, post] } }));
  } else if (source.kind === "web_list") {
    const row = `<div class="structItem structItem--thread">
      <div class="structItem-title"><a href="/forums/">Forum</a><a data-tp-primary="on" href="${url}">Customer file handoff ${T}</a></div>
      <div class="structItem-startDate"><time datetime="${started.toISOString()}">Original post</time></div>
      <div class="structItem-latestDate"><time datetime="${new Date().toISOString()}">Latest reply</time></div>
    </div>`;
    res.end(`<html><body><a href="/members/">Members</a>${row}${row}</body></html>`);
  } else {
    const item = `<item><title>Cleaning handoff ${T}</title><link>${url}</link>
      <pubDate>${started.toUTCString()}</pubDate><dc:creator>Example host</dc:creator>
      <description><![CDATA[<p>${"We reconcile the cleaning checklist with photos from each turnover. ".repeat(8)}</p>]]></description></item>`;
    res.end(`<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Local fixture</title>${item}${item}</channel></rss>`);
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
config.allowPrivateNetworkFetch = true;

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("the English source pack replaces the AI examples and marks unavailable sources explicitly", () => {
  assert.equal(sources.length, 12, "10 communities/services, with two categories each for Signs101 and PrintPlanet");
  assert.equal(new Set(sources.map((s) => s.id)).size, sources.length);
  assert.deepEqual(sources.filter((s) => s.enabled).map((s) => s.id).sort(), [
    "rss-airhostsforum", "rss-reddit-bookkeeping", "rss-reddit-etsysellers", "rss-reddit-propertymanagement", "rss-reddit-weddingphotography",
    "web-printplanet-mis", "web-printplanet-prepress", "web-signs101-sales", "web-signs101-software",
  ]);
  const endpoints = new Set<string>();
  for (const source of sources) {
    assertSupportedConfig(source.kind, source.config);
    assert.equal(source.tier, "T2");
    assert.equal(source.first_party, false);
    assert.equal(source.site_fulltext, false);
    assert.equal(source.syndicate_fulltext, false);
    const endpoint = source.config.feedUrl ?? source.config.url;
    if (endpoint) {
      assert.equal(endpoints.has(endpoint), false, `duplicate endpoint: ${endpoint}`);
      endpoints.add(endpoint);
    }
    if (source.kind === "external") {
      assert.equal(source.enabled, false);
      assert.equal(source.participation_mode, "isolated");
    }
  }
  assert.equal(sources.filter((s) => s.id.startsWith("rss-reddit-") && s.kind === "json_list" && s.enabled).length, 4);
});

test("seeding imports the new pack once and preserves subsequent administrator edits", async () => {
  const seed = () => execFileSync(process.execPath, ["scripts/seed.ts"], {
    cwd: REPO_ROOT,
    env: { ...process.env, COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false" },
    stdio: "pipe",
  });
  seed();
  const ids = sources.map((s) => s.id);
  const rows = await sql`SELECT id, enabled FROM sources WHERE id IN ${sql(ids)}`;
  assert.equal(rows.length, sources.length);
  for (const source of sources) assert.equal(rows.find((r) => r.id === source.id)?.enabled, source.enabled);
  const source = sources[0]!;
  await sql`UPDATE sources SET name = ${`Edited ${T}`}, enabled = false WHERE id = ${source.id}`;
  seed();
  const [edited] = await sql`SELECT name, enabled FROM sources WHERE id = ${source.id}`;
  assert.equal(edited!.name, `Edited ${T}`);
  assert.equal(edited!.enabled, false);
  await sql`UPDATE sources SET name = ${source.name}, enabled = ${source.enabled} WHERE id = ${source.id}`;
  // Real endpoints must never become due during the rest of the local-only suite.
  await sql`UPDATE sources SET next_fetch_at = '2100-01-01' WHERE id IN ${sql(ids)}`;
});

test("forum and RSS collection preserve original dates, archive initial imports and deduplicate repeated reads", async () => {
  for (const source of sources.filter((s) => s.enabled)) {
    const id = `test-niche-${source.id}-${T}`;
    const localConfig = { ...source.config, [source.kind === "rss" ? "feedUrl" : "url"]: `${base}/${source.id}` };
    await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, enabled, next_fetch_at)
      VALUES (${id}, ${source.name}, ${source.kind}, ${sql.json(localConfig)}, 'T2', 'editorial', true, '2100-01-01')`;
    const first = await collectSource(id);
    assert.equal(first.status, "ok", first.error ?? source.id);
    assert.equal(first.created, 1);
    const second = await collectSource(id);
    assert.deepEqual([second.status, second.created, second.revised], ["ok", 0, 0]);
    const rows = await sql`SELECT published_at, backfill, timeline_at, processing_queued_at FROM articles WHERE source_id = ${id}`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.published_at.toISOString(), started.toISOString(), "latest replies never replace the original post date");
    assert.equal(rows[0]!.timeline_at.toISOString(), started.toISOString());
    assert.equal(rows[0]!.backfill, true);
    assert.ok(rows[0]!.processing_queued_at);
    await sql`UPDATE sources SET enabled = false WHERE id = ${id}`;
  }
});

test("unavailable sources stay paused without making a network request", async () => {
  const before = requests;
  for (const source of sources.filter((s) => !s.enabled)) {
    const result = await collectSource(source.id);
    assert.equal(result.status, "skipped");
    assert.equal(result.error, "paused");
  }
  assert.equal(requests, before);
});
