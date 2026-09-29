// Repeatable read-only HTTP acceptance artifact; no model or collector is called.
import assert from "node:assert/strict";
import type { PoolResponse } from "@aihot/contracts/site";
const base=(process.argv[2]??"http://localhost:3000").replace(/\/$/,"");
const api=await fetch(`${base}/api/site/pool`,{signal:AbortSignal.timeout(30000)});
assert.equal(api.status,200);
const pool=await api.json() as PoolResponse;
const res=await fetch(base,{signal:AbortSignal.timeout(30000)});assert.equal(res.status,200);
const html=await res.text();
assert.match(html,/你的第一个产品/);assert.match(html,/从一个小问题开始/);
assert.match(html,/按需求价值排序/);assert.match(html,/第一次来/);
const ids=[...html.matchAll(/data-item-id="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(ids,pool.items.map(i=>i.id),"all items retain demand order");
const ready=pool.items.filter(i=>i.opportunity?.status==="ready");
for(const item of pool.items){if(item.opportunity)assert.ok(!("notes" in item.opportunity)&&!("comments" in item.opportunity)&&!("quote" in item.opportunity));}
if(ready.length){assert.match(html,/谁会用/);assert.match(html,/卡在哪/);assert.match(html,/第一步/);assert.match(html,/看机会详情/);}
if(pool.items.some(i=>i.opportunity?.status==="pending"))assert.match(html,/原始线索.*等待整理/);
assert.doesNotMatch(html,/>精选<|>热点榜<|aria-label="筛选"|预估月收入/);
console.log(JSON.stringify({base,checkedAt:new Date().toISOString(),items:pool.items.length,readyOnPage:ready.length,rankPreserved:true,beginnerGuide:true,privateDataAbsent:true},null,2));
