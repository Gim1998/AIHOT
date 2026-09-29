// Read-only, repeatable HTTP acceptance check. Does not start workers or call a model.
import assert from "node:assert/strict";
import type { PoolResponse, SiteItemDetail } from "@aihot/contracts/site";
const base=(process.argv[2]??"http://localhost:3000").replace(/\/$/,"");
async function get(path:string) {
  const r=await fetch(base+path,{signal:AbortSignal.timeout(30_000),redirect:"manual"});
  assert.equal(r.status,200,`${path}: ${r.status}`);return r;
}
const pool=await (await get("/api/site/pool")).json() as PoolResponse;
assert.ok(pool.items.length,"need at least one published fixture");
assert.ok(pool.items.every(i=>!i.selected&&i.category===null&&i.tags.length===0));
const id=pool.items[0]!.id;
const detail=await (await get(`/api/site/items/${id}`)).json() as SiteItemDetail;
assert.ok(detail.research,"research reading projection is available even before scoring");
assert.ok(detail.research.supportedDimensions>=0&&detail.research.supportedDimensions<=5);
assert.ok(detail.research.discussion.partial,"comments are never represented as complete");
assert.equal("notes" in detail.research,false,"private notes cannot leak");
const html=await (await get(`/items/${id}`)).text();
assert.match(html,/购买理由与证据/);
assert.match(html,/记录我的验证/);
assert.match(html,/可能相似的问题/);
const privateApi=await fetch(base+"/api/admin/research",{redirect:"manual"});
assert.equal(privateApi.status,401);
assert.match(privateApi.headers.get("cache-control")??"",/no-store/);
const privatePage=await fetch(base+"/admin/research",{redirect:"manual"});
assert.ok([302,303,307].includes(privatePage.status));
assert.match(privatePage.headers.get("location")??"",/admin\/login/);
let adminPageVerified=false;
if(process.env.ADMIN_PASSWORD){
  const login=await fetch(base+"/api/auth/password",{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({password:process.env.ADMIN_PASSWORD,return:"/admin/research"})});
  assert.equal(login.status,303);
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie,"admin session created");
  try {
    const page=await fetch(base+"/admin/research",{headers:{cookie},redirect:"manual"});
    assert.equal(page.status,200);
    assert.match(page.headers.get("cache-control")??"",/no-store/);
    const text=await page.text();
    assert.match(text,/实际验证结果与判断理由/);
    assert.match(text,/评分校准样本/);
    const notebook=await fetch(base+"/api/admin/research",{headers:{cookie}});
    assert.equal(notebook.status,200);
    assert.match(notebook.headers.get("cache-control")??"",/no-store/);
    adminPageVerified=true;
  } finally { await fetch(base+"/api/auth/logout",{method:"POST",headers:{cookie},redirect:"manual"}); }
}
console.log(JSON.stringify({base,checkedAt:new Date().toISOString(),itemId:id,publicResearch:true,privateNotebookGuard:true,adminPageVerified,flatFeed:true,scored:detail.score!==null},null,2));
