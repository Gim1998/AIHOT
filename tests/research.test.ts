// End-to-end failure boundaries are recorded in docs/research-validation.md before implementation.
import { stub, tag, Reply } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { FEATURES } from "@aihot/industry/features";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import type { ResearchView, ResearchNotebook } from "@aihot/contracts/research";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { processArticle } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { refreshRedditComments, collectDiscussionBatch } from "@aihot/backend/sources/reddit-comments";
import { buildApp } from "../apps/api/src/app.ts";

Object.assign(FEATURES, { flatFeed: true });
const T = tag();
const source = `research-${T}`;
const body = "We reconcile embroidery invoices with shipping manifests. We use spreadsheets but cannot match embroidery invoices. This takes two hours each week.";
const comment = "I paid $300 for this reconciliation last month.";
let deleted = false;
let failing = false;
let modelCalls = 0;
const reddit = await stub((_n, req) => {
  if (req.url.includes("token")) return { access_token: "local-only", token_type: "bearer", expires_in: 3600 };
  if (failing) return new Reply(503, { error: "mock unavailable" });
  return [{ data: { children: [{ kind: "t3", data: { id: T, selftext: body } }] } }, { data: { children: [
    { kind: "t1", data: { id: "c123", body: deleted ? "[deleted]" : comment, author: "payer", is_submitter: true, created_utc: 1700000000, replies: "" } },
    { kind: "more", data: { count: 40 } },
  ] } }];
});

const llm = await stub(() => {
  modelCalls++;
  const fact = (text: string, quote: string, sourceId = "post") => ({ text, quote, sourceId });
  return { choices: [{ message: { content: JSON.stringify({ titleZh: `刺绣发票核对 ${T}`, summaryZh: "从业者用表格核对发票与发货清单。", demand: {
    itemType: "workflow_pain", noise: "none",
    dimensions: Object.fromEntries(["problem", "pain", "gap", "commercial", "scope"].map(k => [k, { value: 7, evidence: k === "commercial" ? comment : body, sourceId: k === "commercial" ? "c123" : "post" }])),
    research: { facts: { user: fact("刺绣业务从业者", body), payer: null, trigger: null, outcome: fact("核对发票与清单", body), currentSolution: fact("用表格核对", body), gap: fact("无法匹配发票", body), cost: fact("预算 $5000", comment, "c123") },
      paymentKind: "new_tool_budget", terms: ["embroidery", "invoices", "imaginarymarket"],
      suggestions: { experiment: "先用真实样本核对，询问是否愿意付款。", deliverable: "一份差异清单", humanStep: "人工确认匹配", channel: "先向目标从业者验证", pricing: "比较按次与按月", risks: "样本可能无法标准化", searchTerms: ["embroidery invoice reconciliation"] } },
  } }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
Object.assign(process.env, { REDDIT_CLIENT_ID: "local", REDDIT_CLIENT_SECRET: "local", REDDIT_USERNAME: "tester", REDDIT_TOKEN_URL: `${reddit.url}/token`, REDDIT_API_BASE_URL: reddit.url, DEEPSEEK_BASE_URL: llm.url, DEEPSEEK_API_KEY: "local", MODEL_CALLS_ENABLED: "true", ADMIN_PASSWORD: "research-test-password" });
const app = await buildApp();
config.adminPassword = "research-test-password";
await app.listen({ host: "127.0.0.1", port: 0 });
const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
after(async () => { await app.close(); await reddit.close(); await llm.close(); await stopBoss(); await closeDb(); });

test("discussion → one model request → evidence-backed public research; refresh invalidates stale context", async () => {
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext) VALUES (${source},'Research test','json_list','T2','editorial',false)`;
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://www.reddit.com/r/Bookkeeping/comments/${T}/test/`, title: `Embroidery invoices ${T}`, author: 'payer', bodyText: body, via: 'fetch' });
  assert.equal((await refreshRedditComments(articleId)).status, 'ok');
  const hits = reddit.hits();
  assert.equal((await refreshRedditComments(articleId)).status, 'cached');
  assert.equal(reddit.hits(), hits);
  await processArticle(articleId);
  let item = await (await fetch(`${base}/api/site/items/${articleId}`)).json() as { research: ResearchView; body: unknown };
  assert.equal(item.research.facts!.currentSolution!.text, '用表格核对');
  assert.equal(item.research.facts!.cost, null, 'invented amount fails exact evidence check');
  assert.equal(item.research.paymentKind, 'unknown');
  assert.equal(item.research.discussion.sampled, 1);
  assert.equal(item.research.discussion.partial, true);
  assert.doesNotMatch(JSON.stringify(item), /5000|imaginarymarket|local-only/);
  assert.equal(item.body, null, 'summary license remains in force');
  const calls = modelCalls;
  await processArticle(articleId);
  assert.equal(modelCalls, calls, 'unchanged material reuses receipt');
  failing = true;
  await sql`UPDATE article_discussions SET next_check_at=now()-interval '1 hour' WHERE article_id=${articleId}`;
  assert.equal((await refreshRedditComments(articleId)).status, 'failed');
  assert.equal((await sql`SELECT jsonb_array_length(comments) AS n FROM article_discussions WHERE article_id=${articleId}`)[0]!.n, 1);
  failing = false; deleted = true;
  await sql`UPDATE article_discussions SET next_check_at=now()-interval '1 hour' WHERE article_id=${articleId}`;
  await refreshRedditComments(articleId);
  item = await (await fetch(`${base}/api/site/items/${articleId}`)).json() as typeof item;
  assert.equal(item.research.facts, null, 'old interpretation disappears until updated');
  await processArticle(articleId);
  assert.equal((await sql`SELECT jsonb_array_length(comments) AS n FROM article_discussions WHERE article_id=${articleId}`)[0]!.n, 0);

  // A private note is saved through authenticated HTTP, never through the public article.
  assert.equal((await fetch(`${base}/api/admin/research`)).status, 401);
  const login = await fetch(`${base}/api/auth/password`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password: 'research-test-password' }) });
  const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
  const me = await (await fetch(`${base}/api/admin/me`, { headers: { cookie } })).json() as { csrf: string };
  const path = `${base}/api/admin/research/article-${articleId}`;
  const payload = { version: 0, articleId, title: '私人验证', status: 'researching', verdict: 'pursue', notes: `PRIVATE-${T}`, evidenceKind: 'hiring_budget', evidence: '报价不是已成交', sourceUrl: 'https://example.com/job', sourceDate: '', experiment: '人工核对', result: '', acquisition: '', pricing: '' };
  assert.equal((await fetch(path, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) })).status, 403);
  const save = () => fetch(path, { method: 'PUT', headers: { cookie, 'x-csrf-token': me.csrf, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.equal((await save()).status, 200);
  assert.equal((await save()).status, 409, 'stale edits cannot overwrite');
  const privateList = await (await fetch(`${base}/api/admin/research`, { headers: { cookie } })).json() as ResearchNotebook;
  assert.ok(privateList.rows.some((r: { notes: string }) => r.notes === `PRIVATE-${T}`));
  assert.doesNotMatch(await (await fetch(`${base}/api/site/items/${articleId}`)).text(), new RegExp(`PRIVATE-${T}`));
  const bad = { ...payload, version: 1, sourceUrl: 'javascript:alert(1)' };
  assert.equal((await fetch(path, { method: 'PUT', headers: { cookie, 'x-csrf-token': me.csrf, 'content-type': 'application/json' }, body: JSON.stringify(bad) })).status, 400);
});

test("similar public candidates exclude duplicate material and hidden sources; the collection valve stays closed", async () => {
  const create = async (key: string, author: string, text: string) => {
    const r = await upsertMaterial({ sourceId:source,url:`https://example.com/research/${T}/${key}`,title:`Embroidery invoices ${key} ${T}`,author,bodyText:text,via:"fetch" });
    await processArticle(r.articleId);return r.articleId;
  };
  const primary = await create("primary","same-person",body+" First example.");
  const sameAuthor = await create("same-author","same-person",body+" Another example.");
  const different = await create("other","another-person",body+" Other operation.");
  const hidden = await create("hidden","hidden-person",body+" Hidden operation.");
  await sql`UPDATE publications SET visibility='withdrawn' WHERE article_id=${hidden}`;
  const get = async()=>await (await fetch(`${base}/api/site/items/${primary}`)).json() as {research:ResearchView};
  let r=(await get()).research;
  assert.ok(r.similar.some(s=>s.id===sameAuthor));
  assert.ok(r.similar.some(s=>s.id===different));
  assert.ok(!r.similar.some(s=>s.id===hidden));
  const count=r.distinctAuthors;
  // An alias/duplicate with exactly the same stored material cannot count as another case.
  await sql`UPDATE articles SET content_hash=(SELECT content_hash FROM articles WHERE id=${primary}) WHERE id=${different}`;
  r=(await get()).research;
  assert.ok(!r.similar.some(s=>s.id===different));
  assert.equal(r.distinctAuthors,count-1);
  await sql`UPDATE sources SET participation_mode='isolated' WHERE id=${source}`;
  assert.equal((await fetch(`${base}/api/site/items/${primary}`)).status,404);
  const before=reddit.hits();
  assert.deepEqual(await collectDiscussionBatch(),{checked:0,failed:0});
  assert.equal(reddit.hits(),before);
});
