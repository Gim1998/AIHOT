// Public research only reads eligible publications. Private notebook material never enters here.
import type { ResearchView } from "@aihot/contracts/research";
import { sql } from "../db.ts";
import { currentDemand, DEMAND_VERSION, DEMAND_AXES } from "../editorial/demand.ts";
import type { DiscussionComment } from "../editorial/research.ts";

export async function loadResearch(articleId: string): Promise<ResearchView | null> {
  const [row] = await sql`SELECT p.url, a.author, a.content_hash AS article_hash,
    md5(regexp_replace(coalesce(a.body_text,a.excerpt,a.title),'[[:space:]]+',' ','g')) AS body_hash, an.output->'demand' AS demand,
    d.content_hash, d.comments, d.partial, d.checked_at, d.status
    FROM publications p JOIN sources s ON s.id=p.source_id JOIN articles a ON a.id=p.article_id
    LEFT JOIN analyses an ON an.id=p.analysis_id AND an.input_revision=a.revision
    LEFT JOIN article_discussions d ON d.article_id=a.id
    WHERE p.article_id=${articleId} AND p.visibility='public' AND p.eligible AND s.participation_mode='editorial'`;
  if (!row) return null;
  const demand = currentDemand(row.demand, row.content_hash ?? "");
  const research = demand?.research;
  const comments: DiscussionComment[] = row.comments ?? [];
  const facts = research ? Object.fromEntries(Object.entries(research.facts).map(([k, f]) => {
    const sourceUrl = f?.sourceId === "post" ? row.url : comments.find(c => c.id === f?.sourceId)?.url;
    return [k, f && sourceUrl ? { text: f.text, sourceId: f.sourceId, sourceUrl } : null];
  })) as NonNullable<ResearchView["facts"]> : null;
  const terms = research?.terms ?? [];
  // Shared literal business terms find candidates, not proven duplicate needs or market size.
  const candidates = terms.length < 2 ? [] : await sql`SELECT p.article_id AS id,p.title,s.name AS source,p.url,
    coalesce(p.published_at,p.discovered_at) AS at,a.author,a.content_hash,
    md5(regexp_replace(coalesce(a.body_text,a.excerpt,a.title),'[[:space:]]+',' ','g')) AS body_hash,
    (SELECT count(*) FROM jsonb_array_elements_text(an.output->'demand'->'research'->'terms') t WHERE t=ANY(${terms}))::int AS overlap
    FROM analyses an JOIN publications p ON p.analysis_id=an.id JOIN articles a ON a.id=p.article_id JOIN sources s ON s.id=p.source_id
    LEFT JOIN article_discussions d ON d.article_id=a.id
    WHERE an.output->'demand'->'research'->'terms' ?| ${terms}::text[]
      AND p.article_id<>${articleId} AND p.visibility='public' AND p.eligible AND s.participation_mode='editorial'
      AND an.input_revision=a.revision AND an.output->'demand'->>'version'=${DEMAND_VERSION}
      AND coalesce(an.output->'demand'->>'discussionHash','')=coalesce(d.content_hash,'')
      AND (a.content_hash IS NULL OR a.content_hash IS DISTINCT FROM ${row.article_hash})
    ORDER BY overlap DESC,p.timeline_at DESC,p.article_id DESC LIMIT 100`;
  const bodies = new Set([row.body_hash]);
  const matches = candidates.filter(r => {
    if (r.overlap < 2 || bodies.has(r.body_hash)) return false;
    bodies.add(r.body_hash);
    return true;
  }).slice(0,6);
  const authors = new Set<string>();
  for (const r of [{ url: row.url, author: row.author }, ...matches]) {
    if (!r.author || ["[deleted]", "[removed]"].includes(r.author)) continue;
    try { authors.add(`${new URL(r.url).hostname.replace(/^www\./,"")}:${String(r.author).toLowerCase()}`); } catch { /* Invalid historical URL: no identity claim. */ }
  }
  return { facts, paymentKind: research?.paymentKind ?? "unknown", supportedDimensions: DEMAND_AXES.filter(axis => demand?.dimensions?.[axis]?.value != null).length,
    suggestions: research?.suggestions ?? null,
    discussion: { sampled: comments.length, partial: true, checkedAt: row.checked_at?.toISOString() ?? null, status: row.status ?? "not_collected" },
    similar: matches.map(r => ({ id: r.id, title: r.title, source: r.source, at: new Date(r.at).toISOString(), url: r.url })), distinctAuthors: authors.size };
}
