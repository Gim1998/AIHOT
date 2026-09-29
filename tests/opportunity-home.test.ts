// Failure boundaries before implementation: private notes/raw bodies in home payload;
// guessed products from unprocessed posts; obsolete revision/comment assessments;
// discarded zero/unscored rows; changed demand ordering; one SQL lookup per card.
import { stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { FEATURES } from "@aihot/industry/features";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { processArticle } from "@aihot/backend/jobs/content";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../apps/api/src/app.ts";
import type { PoolResponse } from "@aihot/contracts/site";

Object.assign(FEATURES,{flatFeed:true});
const T=tag();
const quote="We spend three hours matching invoice PDFs against spreadsheets every week.";
let noise="none";
let calls=0;
const mock=await stub(()=>{
  calls++;
  const fact=(text:string)=>({text,quote,sourceId:"post"});
  return {choices:[{message:{content:JSON.stringify({titleZh:`对账问题 ${T}`,summaryZh:"人工核对发票和表格耗时。",demand:{itemType:"workflow_pain",noise,
    dimensions:Object.fromEntries(["problem","pain","gap","commercial","scope"].map(k=>[k,{value:8,evidence:quote}])),
    research:{facts:{user:fact("记账人员"),payer:null,trigger:fact("每周对账"),outcome:fact("找出差异"),currentSolution:fact("手工对照表格"),gap:fact("逐张核对很费时"),cost:null},paymentKind:"unknown",terms:["invoice","spreadsheets"],suggestions:{experiment:"先手工核对一份样本，询问是否愿意付费。",deliverable:"发票与表格差异检查表",humanStep:null,channel:null,pricing:null,risks:null,searchTerms:[]}}}})}}],usage:{prompt_tokens:1,completion_tokens:1}};
});
Object.assign(process.env,{DEEPSEEK_BASE_URL:mock.url,DEEPSEEK_API_KEY:"local-test",MODEL_CALLS_ENABLED:"true"});
const app=await buildApp();await app.listen({host:"127.0.0.1",port:0});
const base=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
after(async()=>{await app.close();await mock.close();await stopBoss();await closeDb();});

test("home reads evidence-backed opportunity previews, keeps all rows and invalidates obsolete context",async()=>{
  const source=`home-${T}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext) VALUES (${source},'Home fixture','rss','T2','editorial',false)`;
  const create=async(key:string)=>upsertMaterial({sourceId:source,url:`https://example.com/home/${T}/${key}`,title:`${T} ${key}`,bodyText:quote,via:"fetch"});
  const ready=await create("ready");await processArticle(ready.articleId);
  noise="promotion";const zero=await create("zero");await processArticle(zero.articleId);
  const pending=await create("pending");
  await sql`INSERT INTO research_notes(id,article_id,title,details) VALUES (${`home-note-${T}`},${ready.articleId},'私人记录',${sql.json({notes:`PRIVATE-HOME-${T}`})})`;
  const read=async()=>{
    const res=await fetch(`${base}/api/site/pool?q=${T}`);assert.equal(res.status,200);return await res.json() as PoolResponse;
  };
  const before=calls;
  let pool=await read();
  assert.deepEqual(pool.items.map(i=>i.id),[ready.articleId,zero.articleId,pending.articleId]);
  assert.equal(pool.items[0]!.opportunity!.idea,"发票与表格差异检查表");
  assert.equal(pool.items[0]!.opportunity!.user,"记账人员");
  assert.equal(pool.items[0]!.opportunity!.payment,null);
  assert.equal(pool.items[1]!.opportunity!.status,"insufficient");
  assert.equal(pool.items[1]!.opportunity!.idea,null);
  assert.equal(pool.items[2]!.opportunity!.status,"pending");
  assert.doesNotMatch(JSON.stringify(pool.items),/sourceId|quote|body_text/);
  assert.doesNotMatch(JSON.stringify(pool),new RegExp(`PRIVATE-HOME-${T}`));
  assert.equal(calls,before,"opening the home page never calls a model");
  const search=await (await fetch(`${base}/api/site/pool?q=${encodeURIComponent("差异检查表")}`)).json() as PoolResponse;
  assert.ok(search.items.some(i=>i.id===ready.articleId),"the displayed tool idea is searchable");
  assert.ok(!search.items.some(i=>i.id===zero.articleId),"suppressed product hypotheses are not indexed");
  await sql`INSERT INTO article_discussions(article_id,content_hash) VALUES (${ready.articleId},'changed-context')`;
  pool=await read();
  assert.equal(pool.items.find(i=>i.id===ready.articleId)!.opportunity!.status,"pending");
  assert.equal(pool.items.find(i=>i.id===ready.articleId)!.opportunity!.idea,null);
  await sql`UPDATE articles SET revision=revision+1 WHERE id=${zero.articleId}`;
  pool=await read();assert.equal(pool.items.find(i=>i.id===zero.articleId)!.opportunity!.status,"pending");
});
