// HTTP E2E artifact: verifies the deployed flat stream and its public publication API.
import assert from "node:assert/strict";
const base = process.argv[2] ?? "http://localhost:3000";
const pool = await fetch(`${base}/api/site/pool`).then(r => r.json()) as any;
assert.ok(pool.items.length > 0, "the homepage must have collected material before a model key is set");
assert.ok(pool.items.every((item: any) => item.category === null && item.tags.length === 0 && !item.selected && item.score === null));
assert.ok(pool.items.every((item: any, index: number) => index === 0 || item.timelineAt <= pool.items[index - 1].timelineAt));
for (const path of ["/", "/all", "/about", "/terms", "/privacy", "/changelog"]) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.doesNotMatch(html, /AI 行业动态|AI 圈|按主题看 AI|公司与模型|上百个信源|AI 日报|AI HOT/, path);
  if (path === "/" || path === "/all") {
    assert.ok(html.includes(`data-item-id="${pool.items[0].id}"`), "SSR renders the same published stream");
    assert.doesNotMatch(html, /aria-label="筛选"|>精选<|>热点榜<|href="\/topics"|推荐理由：/, path);
  }
  console.log(`PASS ${path}: flat feed and current copy`);
}
const topics = await fetch(`${base}/api/site/topics`).then(r => r.json()) as any;
assert.deepEqual(topics.topics, []);
for (const path of ["/topics", "/hot", "/topics/openai", "/topics/deepseek"]) {
  assert.equal((await fetch(base + path, { redirect: "manual" })).status, 404, path);
  console.log(`PASS retired classification ${path}: 404`);
}
const rss = await fetch(`${base}/feed.xml`).then(r => r.text());
assert.ok(rss.includes(pool.items[0].id), "RSS uses the same flat publication set");
console.log(`PASS ${base}: ${pool.total} public items; descending time; no categories, tags, scores or selection`);
