import { z } from "zod";
import { RESEARCH_STATUS, RESEARCH_VERDICTS, PAYMENT_KINDS, type ResearchNote, type ResearchNotebook } from "@aihot/contracts/research";
import { sql } from "../db.ts";
import { Conflict } from "./sources.ts";
import { audit } from "./auth.ts";

const text = z.string().trim().max(4000).default("");
const schema = z.object({
  version: z.number().int().nonnegative(), articleId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).nullable().default(null),
  title: z.string().trim().min(1).max(240), status: z.enum(Object.keys(RESEARCH_STATUS) as [keyof typeof RESEARCH_STATUS, ...(keyof typeof RESEARCH_STATUS)[]]),
  verdict: z.enum(Object.keys(RESEARCH_VERDICTS) as [keyof typeof RESEARCH_VERDICTS, ...(keyof typeof RESEARCH_VERDICTS)[]]),
  evidenceKind: z.enum(Object.keys(PAYMENT_KINDS) as [keyof typeof PAYMENT_KINDS, ...(keyof typeof PAYMENT_KINDS)[]]),
  notes: text, evidence: text, experiment: text, result: text, acquisition: text, pricing: text,
  sourceUrl: z.string().trim().max(2000).refine(v => {
    if (!v) return true;
    try { const u=new URL(v); return ["https:","http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
  }),
  sourceDate: z.string().max(10).refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v),
}).strict();
function invalid(message: string): never { throw Object.assign(new Error(message), { statusCode: 400 }); }
const note = (r: any): ResearchNote => ({ ...r.details, id:r.id, articleId:r.article_id, title:r.title, status:r.status, verdict:r.verdict, version:r.version, updatedAt:r.updated_at.toISOString() });

export async function saveResearchNote(id: string, input: unknown, actor: string) {
  if (!/^[\w-]{1,100}$/.test(id)) invalid("记录 ID 格式不正确");
  const parsed = schema.safeParse(input);
  if (!parsed.success) invalid("请检查标题、状态、来源链接、日期与文本长度");
  const { articleId, title, status, verdict, version, ...details } = parsed.data;
  if (verdict === "paid" && (!details.result || details.evidenceKind !== "completed_payment" || !details.evidence)) invalid("实际付款需要已发生付款的证据和验证结果");
  const row = await sql.begin(async tx => {
    if (articleId && !(await tx`SELECT id FROM articles WHERE id=${articleId}`).length) invalid("关联内容不存在");
    const [existing] = await tx`SELECT article_id,version FROM research_notes WHERE id=${id} FOR UPDATE`;
    if (existing && (existing.version !== version || existing.article_id !== articleId) || !existing && version !== 0) throw new Conflict("记录已更新，请刷新后再保存");
    if (articleId && id !== `article-${articleId}`) invalid("请使用内容对应的验证记录");
    const rows = await tx`INSERT INTO research_notes(id,article_id,title,status,verdict,details) VALUES (${id},${articleId},${title},${status},${verdict},${tx.json(details)})
      ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,status=EXCLUDED.status,verdict=EXCLUDED.verdict,details=EXCLUDED.details,
        version=research_notes.version+1,updated_at=now() WHERE research_notes.version=${version} RETURNING *`;
    if (!rows[0]) throw new Conflict("记录已更新，请刷新后再保存");
    return rows[0];
  });
  await audit(actor,"research.save",`research:${id}`,null,{version},{version:row.version,status,verdict});
  return note(row);
}

export async function researchNotebook(input: { page?: string; article?: string; note?: string }): Promise<ResearchNotebook> {
  const page = Math.min(1000,Math.max(1,Math.floor(Number(input.page)||1)));
  const [rows, count, selected, article, calibration] = await Promise.all([
    sql`SELECT * FROM research_notes ORDER BY updated_at DESC,id LIMIT 30 OFFSET ${(page-1)*30}`,
    sql`SELECT count(*)::int AS n FROM research_notes`,
    input.article ? sql`SELECT * FROM research_notes WHERE article_id=${input.article}` : input.note ? sql`SELECT * FROM research_notes WHERE id=${input.note}` : [],
    input.article ? sql`SELECT a.id,coalesce(p.title,a.title) AS title,a.url FROM articles a LEFT JOIN publications p ON p.article_id=a.id WHERE a.id=${input.article}` : [],
    sql`SELECT n.verdict,count(*)::int AS count,round(avg(p.score))::int AS "averageScore" FROM research_notes n LEFT JOIN publications p ON p.article_id=n.article_id GROUP BY n.verdict`,
  ]);
  return { rows:rows.map(note),page,total:count[0]!.n,selected:selected[0]?note(selected[0]):null,article:article[0]?{id:article[0].id,title:article[0].title,url:article[0].url}:null,
    calibration:calibration.map(r=>({verdict:r.verdict,count:r.count,averageScore:r.averageScore})) };
}
