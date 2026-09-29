// A bounded sample from the official comment-tree endpoint, never an exhaustive discussion.
import { sql } from "../db.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { invocationSignal } from "../lib/deadline.ts";
import { fetchReddit } from "../providers/reddit.ts";
import { publishArticle } from "../publication/publish.ts";
import type { DiscussionComment } from "../editorial/research.ts";

export async function refreshRedditComments(articleId: string) {
  const [a] = await sql`SELECT a.url FROM articles a JOIN sources s ON s.id=a.source_id
    WHERE a.id=${articleId} AND s.enabled AND s.participation_mode='editorial'`;
  const match = a && /^https:\/\/(?:www\.)?reddit\.com\/r\/([\w]+)\/comments\/([a-z0-9]+)(?:\/|$)/i.exec(a.url);
  if (!match) return { status: "unsupported" as const };
  const claim = await sql`INSERT INTO article_discussions(article_id,next_check_at) VALUES (${articleId},now()+interval '6 hours')
    ON CONFLICT(article_id) DO UPDATE SET next_check_at=now()+interval '6 hours'
    WHERE article_discussions.next_check_at<=now() RETURNING content_hash`;
  if (!claim.length) return { status: "cached" as const };
  let received = false;
  try {
    const res = await fetchReddit(`https://oauth.reddit.com/r/${match[1]}/comments/${match[2]}?limit=20&depth=3&sort=new&raw_json=1`);
    const data = JSON.parse(res.text());
    const post = data?.[0]?.data?.children?.find((n: any) => n.kind === "t3")?.data;
    const nodes = data?.[1]?.data?.children;
    if (!post || post.id !== match[2] || !Array.isArray(nodes)) throw new Error("Invalid comment listing");
    const removed = ["[removed]", "[deleted]"].includes(post.selftext);
    const comments: DiscussionComment[] = [];
    let chars = 0;
    const seen = new Set<string>();
    const walk = (children: any[], depth: number) => {
      for (const node of children) {
        if (depth > 3 || comments.length >= 20 || chars >= 9000) break;
        const d = node?.data;
        if (node?.kind !== "t1" || !d || !/^[a-z0-9]+$/.test(d.id) || seen.has(d.id)) continue;
        seen.add(d.id);
        const text = typeof d.body === "string" ? d.body.slice(0, Math.min(1200, 9000 - chars)) : "";
        const at = Number(d.created_utc) * 1000;
        if (text && !["[removed]", "[deleted]"].includes(text) && Number.isFinite(at) && at > 0 && at <= Date.now() + 3600_000) {
          comments.push({ id: d.id, author: typeof d.author === "string" && d.author !== "[deleted]" ? d.author.slice(0, 80) : null,
            isOp: d.is_submitter === true, text, url: `https://www.reddit.com/r/${match[1]}/comments/${match[2]}/_/${d.id}/`, at: new Date(at).toISOString() });
          chars += text.length;
        }
        if (Array.isArray(d.replies?.data?.children)) walk(d.replies.data.children, depth + 1);
      }
    };
    if (!removed) walk(nodes, 0);
    const contentHash = sha256(stableJson({ removed, comments }));
    received = true;
    await sql.begin(async tx => {
      await tx`SELECT id FROM articles WHERE id=${articleId} FOR UPDATE`;
      await tx`UPDATE article_discussions SET comments=${tx.json(comments as never)}, content_hash=${contentHash}, partial=true,
        checked_at=now(), status=${removed ? "removed" : "ok"}, next_check_at=now()+interval '24 hours' WHERE article_id=${articleId}`;
      if (contentHash !== claim[0]!.content_hash) await tx`UPDATE articles SET processing_state='new', processing_retry_at=NULL, processing_queued_at=NULL WHERE id=${articleId}`;
    });
    if (contentHash !== claim[0]!.content_hash) await publishArticle(articleId);
    return { status: "ok" as const, sampled: comments.length };
  } catch (error) {
    if (received) throw error;
    // Keep the last successful snapshot. The next slot can retry; no tight retry loop or raw error body.
    await sql`UPDATE article_discussions SET status='failed' WHERE article_id=${articleId}`;
    return { status: "failed" as const };
  }
}

export async function collectDiscussionBatch() {
  if (process.env.COLLECT_ENABLED !== "true") return { checked: 0, failed: 0 };
  const candidates = await sql<{ id: string }[]>`SELECT a.id FROM articles a JOIN sources s ON s.id=a.source_id
    LEFT JOIN article_discussions d ON d.article_id=a.id LEFT JOIN research_notes n ON n.article_id=a.id
    WHERE s.enabled AND s.participation_mode='editorial' AND a.url ~ '^https://(www\.)?reddit.com/r/'
      AND (d.next_check_at IS NULL OR d.next_check_at<=now()) AND coalesce(d.status,'')<>'removed'
      AND (a.discovered_at>now()-interval '30 days' OR n.status IN ('researching','testing'))
    ORDER BY d.checked_at ASC NULLS FIRST, a.discovered_at DESC LIMIT 6`;
  const started = Date.now();
  let checked = 0, failed = 0;
  for (const a of candidates) {
    if (invocationSignal()?.aborted || Date.now() - started > 30_000) break;
    const result = await refreshRedditComments(a.id);
    checked++;
    if (result.status === "failed") { failed++; break; }
  }
  return { checked, failed };
}
