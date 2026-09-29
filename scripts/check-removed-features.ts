// End-to-end check: removed navigation must not leave accessible pages or discovery links.
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3000";
for (const path of ["/", "/more", "/terms"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.doesNotMatch(html, /href="\/(agent|leaderboard|codex-reset)(?:[/?"])/, path);
  console.log(`PASS ${path}: removed links absent`);
}
for (const path of ["/agent", "/agent?tab=mcp", "/leaderboard", "/leaderboard/rules", "/leaderboard/sources", "/codex-reset", "/codex-reset/history/2026-09-29", "/api/site/leaderboard/boards/overall", "/api/site/codex-reset", "/api/v1/codex-resets", "/api/admin/monitor/events", "/og/pages/agent.png"]) {
  const response = await fetch(base + path, { redirect: "manual" });
  assert.equal(response.status, 404, path);
  await response.arrayBuffer();
  console.log(`PASS ${path}: 404`);
}
for (const path of ["/sitemap.xml", "/llms.txt", "/feed.xml"]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  assert.doesNotMatch(await response.text(), /https?:\/\/[^\s<)]+\/(agent|leaderboard|codex-reset)(?:[/?<)\s]|$)/, path);
  console.log(`PASS ${path}: removed discovery links absent`);
}
