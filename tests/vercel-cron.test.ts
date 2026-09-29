// Failure cases: unauthenticated collection, duplicate cron delivery, overlapping runs,
// a full free-tier database, leaked background polling, or work continuing past its deadline.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { PgBoss } from "pg-boss";
import { config } from "@aihot/backend/config";
import { sql, closeDb } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { runCollectionBatch } from "@aihot/backend/jobs/serverless";
import { withinDeadline } from "@aihot/backend/lib/deadline";
import { guardedFetch } from "@aihot/backend/lib/http-fetch";
import { buildApp } from "../apps/api/src/app.ts";
import { submitFeedback } from "@aihot/backend/operations/feedback";
import { replaceContactQr } from "@aihot/backend/admin/settings";

const T = tag();
let hits = 0;
const server = http.createServer((req, res) => {
  if (req.url === "/slow") return;
  hits += 1;
  res.setHeader("content-type", "application/rss+xml");
  res.end(`<rss version="2.0"><channel><title>Local fixture</title><item><title>Workflow ${T}</title><link>https://example.org/${T}</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
config.allowPrivateNetworkFetch = true;
config.serverless = true;
config.modelCallsEnabled = false;
const setup = new PgBoss({ connectionString: config.databaseUrl, schema: "pgboss", schedule: false, supervise: false });
await setup.start();
await setup.stop();
const app = await buildApp();
after(async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); await app.close(); await stopBoss(); await closeDb(); });

test("cron rejects missing or incorrect secrets before doing work", async () => {
  process.env.CRON_SECRET = "test-cron-secret-01234567890123456789";
  for (const authorization of [undefined, "Bearer wrong"]) {
    const response = await app.inject({ method: "GET", url: "/api/cron/collect", headers: authorization ? { authorization } : {} });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers["cache-control"], "no-store");
  }
  assert.equal(hits, 0);
});

test("one cron slot collects once, keeps the six-hour interval, and leaves AI work queued", async () => {
  const id = `vercel-${T}`;
  await sql`INSERT INTO sources (id, name, kind, config, interval_minutes, next_fetch_at)
    VALUES (${id}, 'Serverless fixture', 'rss', ${sql.json({ feedUrl: `${base}/feed` })}, 360, now())`;
  const slot = `test-${T}`;
  const results = await Promise.all([runCollectionBatch({ slot, sourceIds: [id], seconds: 10 }), runCollectionBatch({ slot, sourceIds: [id], seconds: 10 })]);
  assert.equal(results.filter((r) => r.status === "ok").length, 1);
  assert.equal(results.filter((r) => r.status === "skipped").length, 1);
  assert.equal(hits, 1);
  assert.equal((await runCollectionBatch({ slot, sourceIds: [id], seconds: 10 })).status, "skipped");
  assert.equal(hits, 1);
  const [article] = await sql`SELECT processing_state, processing_queued_at FROM articles WHERE source_id = ${id}`;
  assert.equal(article!.processing_state, "new");
  assert.ok(article!.processing_queued_at);
  const [source] = await sql`SELECT interval_minutes FROM sources WHERE id = ${id}`;
  assert.equal(source!.interval_minutes, 360);
});

test("database guard stops writes before the free storage ceiling", async () => {
  const before = hits;
  const result = await runCollectionBatch({ slot: `full-${T}`, sourceIds: [], databaseLimitBytes: 1 });
  assert.equal(result.status, "storage-limit");
  assert.equal(hits, before);
});

test("outbound requests inherit the remaining invocation deadline", async () => {
  const started = Date.now();
  await assert.rejects(withinDeadline(100, () => guardedFetch(`${base}/slow`, { timeoutMs: 20_000 })));
  assert.ok(Date.now() - started < 2000);
});

// Vercel's temporary disk cannot promise persistence across requests or deployments.
test("cloud uploads fail explicitly instead of returning an ephemeral file URL", async () => {
  await assert.rejects(submitFeedback({ content: "cloud screenshot", screenshot: { mime: "image/png", data: Buffer.from("fixture") }, ip: "127.0.0.1", userAgent: "fixture" }), /云端.*截图/);
  await assert.rejects(replaceContactQr({ slot: "wechatQr", data: Buffer.from("fixture") }, "test"), /云端.*上传/);
});
