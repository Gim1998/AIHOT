// Failure cases: missing credentials, duplicate token grants, expired/revoked tokens,
// rate-limit retry storms, secret-bearing redirects/errors, and duplicate or misdated posts.
// OAuth and listing requests use a local HTTP server; collection writes to the test database.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { collectSource } from "@aihot/backend/sources/collect";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import type { SourceRow } from "@aihot/backend/sources/types";

const T = tag();
const created = Math.floor((Date.now() - 96 * 3600_000) / 1000);
let mode = "ok";
let tokenCalls = 0;
let listingCalls = 0;
let redirectedCalls = 0;
const grants: URLSearchParams[] = [];
const authorizations: string[] = [];
const body = { data: { children: [{ kind: "t3", data: {
  name: `t3_${T}`, title: "Monthly client document collection", selftext: "Clients often miss one month of receipts.",
  permalink: `/r/Bookkeeping/comments/${T}/monthly_documents/`, author: "example_account", created_utc: created,
} }] } };
const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/api/v1/access_token") {
    tokenCalls += 1;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    grants.push(new URLSearchParams(Buffer.concat(chunks).toString()));
    assert.match(req.headers.authorization ?? "", /^Basic /);
    if (mode === "token-error") { res.writeHead(400).end(JSON.stringify({ error: "test-client-secret test-refresh-secret" })); return; }
    if (mode === "token-redirect") { res.writeHead(302, { location: `${base}/leak` }).end(); return; }
    if (mode === "token-expired") { res.end(JSON.stringify({ access_token: "expired", token_type: "bearer", expires_in: 0 })); return; }
    res.end(JSON.stringify({ access_token: `test-access-${tokenCalls}`, token_type: "bearer", expires_in: 3600 }));
    return;
  }
  if (req.url === "/leak") { redirectedCalls += 1; res.end("{}"); return; }
  listingCalls += 1;
  authorizations.push(req.headers.authorization ?? "");
  assert.match(req.headers["user-agent"] ?? "", /by \/u\/example_account/);
  if (mode === "apply-failure" && req.url?.startsWith("/r/WeddingPhotography/")) { res.writeHead(403).end("{}"); return; }
  if (mode === "unauthorized" || (mode === "expired-once" && listingCalls === 1)) { res.writeHead(401).end("{}"); return; }
  if (mode === "limited") { res.writeHead(429, { "retry-after": "7200" }).end("test-access-private"); return; }
  if (mode === "limited-date") { res.writeHead(429, { "retry-after": new Date(Date.now() + 7200_000).toUTCString() }).end("{}"); return; }
  if (mode === "redirect") { res.writeHead(302, { location: `${base}/leak` }).end(); return; }
  if (mode === "exhausted") res.setHeader("x-ratelimit-remaining", "0");
  if (mode === "exhausted") res.setHeader("x-ratelimit-reset", "600");
  res.end(JSON.stringify(body));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
config.allowPrivateNetworkFetch = true;

const source: SourceRow = {
  id: `test-reddit-${T}`, name: "Reddit test", kind: "json_list", tier: "T2", participation_mode: "editorial",
  first_party: false, interval_minutes: 60, enabled: true, cursor: null, fail_count: 0,
  config: {
    url: "https://oauth.reddit.com/r/Bookkeeping/new?limit=25&raw_json=1", itemsPath: "data.children",
    titlePaths: ["data.title"], summaryPaths: ["data.selftext"], summaryIsBody: true,
    authorPaths: ["data.author"], publishedAtPath: "data.created_utc", publishedAtUnit: "epoch_s",
    externalIdPath: "data.name", urlTemplate: "https://www.reddit.com{raw:data.permalink}",
    allowUrlPrefixes: ["https://www.reddit.com/r/Bookkeeping/comments/"],
  },
};

function scenario(next: string) {
  mode = next; tokenCalls = 0; listingCalls = 0; redirectedCalls = 0; grants.length = 0; authorizations.length = 0;
  Object.assign(process.env, {
    REDDIT_CLIENT_ID: `${next}-${T}`, REDDIT_CLIENT_SECRET: "test-client-secret",
    REDDIT_USER_AGENT: "server:niche-source-tests:v1 (by /u/example_account)",
    REDDIT_TOKEN_URL: `${base}/api/v1/access_token`, REDDIT_API_BASE_URL: base,
  });
  delete process.env.REDDIT_REFRESH_TOKEN;
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await stopBoss(); await closeDb();
});

test("Reddit requires server credentials and shares one app-only token across concurrent sources", async () => {
  scenario("ok");
  delete process.env.REDDIT_CLIENT_SECRET;
  await assert.rejects(fetchJsonList(source), /REDDIT_CLIENT_SECRET/);
  assert.equal(tokenCalls, 0);
  process.env.REDDIT_CLIENT_SECRET = "test-client-secret";
  const lists = await Promise.all([fetchJsonList(source), fetchJsonList(source)]);
  assert.equal(tokenCalls, 1);
  assert.equal(grants[0]!.get("grant_type"), "client_credentials");
  assert.deepEqual(authorizations, ["Bearer test-access-1", "Bearer test-access-1"]);
  assert.equal(lists[0]![0]!.bodyText, "Clients often miss one month of receipts.");
  assert.equal(lists[0]![0]!.publishedAt!.getTime(), created * 1000);
  delete process.env.REDDIT_USER_AGENT;
  process.env.REDDIT_USERNAME = "example_account";
  assert.equal((await fetchJsonList(source)).length, 1, "a configured username supplies the application contact in User-Agent");
  delete process.env.REDDIT_USERNAME;
});

test("authorized user refresh tokens are supported and a 401 renews a token only once", async () => {
  scenario("expired-once");
  process.env.REDDIT_REFRESH_TOKEN = "test-refresh-secret";
  assert.equal((await fetchJsonList(source)).length, 1);
  assert.equal(tokenCalls, 2);
  assert.equal(grants[0]!.get("grant_type"), "refresh_token");
  assert.equal(grants[0]!.get("refresh_token"), "test-refresh-secret");
  assert.deepEqual(authorizations, ["Bearer test-access-1", "Bearer test-access-2"]);
  scenario("unauthorized");
  await assert.rejects(fetchJsonList(source), /401/);
  assert.equal(tokenCalls, 2);
  assert.equal(listingCalls, 2);
});

test("Reddit never follows authenticated redirects or logs token response bodies", async () => {
  for (const next of ["token-error", "token-redirect", "token-expired", "redirect"]) {
    scenario(next);
    await assert.rejects(fetchJsonList(source), (error: Error) => {
      assert.doesNotMatch(error.message, /test-client-secret|test-refresh-secret|test-access-/);
      return true;
    });
    assert.equal(redirectedCalls, 0);
  }
  scenario("untrusted-base");
  process.env.REDDIT_API_BASE_URL = "https://example.com";
  await assert.rejects(fetchJsonList(source), /REDDIT_API_BASE_URL/);
  assert.equal(tokenCalls, 0);
});

test("collection stores canonical threads once and keeps short self-post bodies and original dates", async () => {
  scenario("collection");
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, next_fetch_at)
    VALUES (${source.id}, ${source.name}, ${source.kind}, ${sql.json(source.config)}, 'T2', 'editorial', 60, '2100-01-01')`;
  assert.equal((await collectSource(source.id)).created, 1);
  assert.equal((await collectSource(source.id)).created, 0);
  const rows = await sql`SELECT url, body_text, body_status, published_at, backfill FROM articles WHERE source_id = ${source.id}`;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.url, `https://www.reddit.com/r/Bookkeeping/comments/${T}/monthly_documents/`);
  assert.equal(rows[0]!.body_text, body.data.children[0]!.data.selftext);
  assert.equal(rows[0]!.body_status, "ok");
  assert.equal(rows[0]!.published_at.getTime(), created * 1000);
  assert.equal(rows[0]!.backfill, true);
});

test("429 cooldowns are shared and schedule the source no earlier than Retry-After", async () => {
  for (const next of ["limited", "limited-date"]) {
    scenario(next);
    const [before] = await sql`SELECT cursor FROM sources WHERE id = ${source.id}`;
    const run = await collectSource(source.id, { force: true });
    assert.equal(run.status, "failed");
    assert.match(run.error ?? "", /429/);
    assert.doesNotMatch(run.error ?? "", /test-access-private/);
    const [after] = await sql`SELECT cursor, next_fetch_at FROM sources WHERE id = ${source.id}`;
    assert.deepEqual(after!.cursor, before!.cursor);
    assert.ok(after!.next_fetch_at.getTime() > Date.now() + 7190_000);
    await assert.rejects(fetchJsonList(source), /429/);
    assert.equal(listingCalls, 1, "a different source shares the application cooldown");
  }
  scenario("exhausted");
  assert.equal((await fetchJsonList(source)).length, 1);
  await assert.rejects(fetchJsonList(source), /429/);
  assert.equal(listingCalls, 1);
});

test("the connection command migrates the existing four IDs only after every preview succeeds", async () => {
  const { sources } = JSON.parse(readFileSync(`${REPO_ROOT}/industry/sources.json`, "utf8")) as { sources: SourceRow[] };
  const ids = sources.filter((s) => s.id.startsWith("rss-reddit-")).map((s) => s.id);
  for (const id of ids) {
    await sql`INSERT INTO sources (id, name, kind, config, enabled, next_fetch_at)
      VALUES (${id}, 'Legacy Reddit RSS', 'rss', '{}'::jsonb, false, '2100-01-01')
      ON CONFLICT (id) DO UPDATE SET kind = 'rss', config = '{}'::jsonb, enabled = false`;
  }
  const apply = () => promisify(execFile)(process.execPath, ["scripts/connect-reddit.ts", "--apply"], {
    cwd: REPO_ROOT, env: { ...process.env, ALLOW_PRIVATE_NETWORK_FETCH: "true", COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false" },
  });
  scenario("apply-failure");
  await assert.rejects(apply());
  const failed = await sql`SELECT kind, enabled FROM sources WHERE id IN ${sql(ids)}`;
  assert.ok(failed.every((s) => s.kind === "rss" && !s.enabled), "failed previews make no partial database changes");
  scenario("apply");
  await apply();
  const ready = await sql`SELECT kind, config, enabled, site_fulltext FROM sources WHERE id IN ${sql(ids)}`;
  assert.equal(ready.length, 4);
  assert.ok(ready.every((s) => s.kind === "json_list" && s.enabled && !s.site_fulltext));
  const cursor = { initializedAt: new Date().toISOString() };
  await sql`UPDATE sources SET cursor = ${sql.json(cursor)} WHERE id IN ${sql(ids)}`;
  await apply();
  const repeated = await sql`SELECT cursor FROM sources WHERE id IN ${sql(ids)}`;
  assert.ok(repeated.every((s) => JSON.stringify(s.cursor) === JSON.stringify(cursor)), "an unchanged repeat preserves collection progress");
  await sql`UPDATE sources SET next_fetch_at = '2100-01-01' WHERE id IN ${sql(ids)}`;
});
