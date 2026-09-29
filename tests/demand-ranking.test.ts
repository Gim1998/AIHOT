// Integration failure cases, before implementation: fabricated evidence inflating scores;
// source-tier bias; old news scores surviving; solved/promo items outranking real needs;
// title-only guesses; null sorting above zero; unstable score ties/page boundaries;
// paid retries; revisions retaining stale scores; scoring hiding public material.
import { stub, tag } from "./setup.ts";
import { FEATURES } from "@aihot/industry/features";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { processArticle } from "@aihot/backend/jobs/content";
import { publishArticle } from "@aihot/backend/publication/publish";
import { loadPool } from "@aihot/backend/publication/pool";
import { itemFeed } from "@aihot/backend/publication/feeds";
import { stopBoss } from "@aihot/backend/jobs/queue";
Object.assign(FEATURES, { flatFeed: true });
const T = tag();
const source = `demand-${T}`;
const evidence = {
  problem: "We manage 40 client accounts and manually match invoices to receipts.",
  pain: "It takes two hours every week.",
  gap: "Our paid bookkeeping app cannot export the custom fields.",
  commercial: "We hired a contractor for $300 to organize the receipt packs.",
  scope: "We need a CSV and PDF checklist that flags missing receipts.",
};
const text = Object.values(evidence).join(" ");
let mode = "paid";
let calls = 0;
const provider = await stub((_hit, req) => {
  calls++;
  const body = JSON.parse(req.body);
  assert.equal(body.model, "deepseek-flash");
  assert.equal(body.messages.at(-1).content.includes('分级：'), false, "source tiers must not affect the new score");
  const dimensions = Object.fromEntries(Object.entries(evidence).map(([key, quote]) => [key, { value: 8, evidence: quote }]));
  if (mode === "forged") dimensions.commercial = { value: 10, evidence: "We will pay $5000 every month." };
  const demand = { itemType: "workflow_pain", noise: mode === "promo" ? "promotion" : mode === "solved" ? "resolved" : "none", dimensions };
  return { id: `demand-${calls}`, choices: [{ message: { content: JSON.stringify({ titleZh: `凭证整理需求 ${T}`, summaryZh: "记账从业者需要检查 CSV 与 PDF 中的凭证缺漏。", demand }) } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
});
Object.assign(process.env, { DEEPSEEK_BASE_URL: provider.url, DEEPSEEK_API_KEY: "test-key", MODEL_CALLS_ENABLED: "true" });
after(async () => { await provider.close(); await stopBoss(); await closeDb(); });
const query = { channel: "all" as const, category: null, tag: null, topic: null, topicTags: null, q: T, tab: "time" as const, page: 1 };

test("new demand evidence → deterministic weighted score → ranked flat publication without hiding low values", async () => {
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext) VALUES (${source},'Demand fixture','rss','T2','editorial',false)`;
  const ids: Record<string,string> = {};
  for (const key of ["paid", "forged", "promo", "solved", "title-only", "pending"]) {
    mode = key;
    const {articleId} = await upsertMaterial({ sourceId: source, url: `https://example.com/${T}/${key}`, title: `Receipt workflow ${T} ${key}`, bodyText: key === "title-only" ? null : text, bodyStatus: "none", via: "fetch", discoveredAt: new Date(Date.now() - (key === "paid" ? 3600000 : 0)) });
    ids[key] = articleId;
    if (key !== "pending") await processArticle(articleId);
  }
  const rows = await sql`SELECT article_id,score,reason,selected,category,tags,eligible FROM publications WHERE source_id=${source}`;
  const byId = Object.fromEntries(rows.map(r=>[r.article_id,r]));
  assert.equal(Number(byId[ids.paid!]!.score), 80);
  assert.equal(Number(byId[ids.forged!]!.score), 72, "unsupported commercial claim contributes no points");
  for (const key of ["promo", "solved"]) assert.equal(Number(byId[ids[key]!]!.score), 0);
  for (const key of ["title-only", "pending"]) assert.equal(byId[ids[key]!]!.score, null);
  assert.ok(rows.every(r=>r.eligible && !r.selected && r.category===null && r.tags.length===0));
  assert.doesNotMatch(byId[ids.forged!]!.reason, /5000/);
  assert.match(byId[ids.forged!]!.reason, /付费证据.*未提供/);
  const pool = await loadPool(query);
  assert.deepEqual(pool.items.slice(0,2).map(i=>i.id), [ids.paid,ids.forged]);
  assert.equal(pool.items.length,6, "zero and unscored items stay visible");
  assert.ok(pool.items.slice(-2).every(i=>i.score===null));
  assert.ok(pool.items[0]!.reason);
  const before = calls;
  await sql`UPDATE sources SET tier='T1',first_party=true WHERE id=${source}`;
  await processArticle(ids.paid!);
  assert.equal(calls,before,"the same material reuses its request; source reputation is not an input");
  assert.equal(Number((await sql`SELECT score FROM publications WHERE article_id=${ids.paid!}`)[0]!.score),80);
  const feed = await itemFeed("selected",null);
  const rssIds=[...feed.matchAll(/<guid[^>]*>([^<]+)/g)].map(m=>m[1]);
  assert.ok(rssIds.indexOf(ids.paid!) < rssIds.indexOf(ids.forged!));
  // An obsolete news judgement never substitutes for a demand rating.
  await sql`INSERT INTO analyses(article_id,input_revision,origin,score,title_zh,summary_zh,selected,relevance,output) VALUES (${ids.pending!},1,'rule',99,'旧新闻高分','旧新闻摘要',true,'pass','{}')`;
  await publishArticle(ids.pending!);
  assert.equal((await sql`SELECT score FROM publications WHERE article_id=${ids.pending!}`)[0]!.score,null);
  await upsertMaterial({ sourceId:source,url:`https://example.com/${T}/paid`,title:`Changed problem ${T}`,bodyText:'New material not assessed yet.',bodyStatus:'ok',via:'fetch' });
  assert.equal((await sql`SELECT score FROM publications WHERE article_id=${ids.paid!}`)[0]!.score,null,"new revisions lose old scores until reassessed");
});
