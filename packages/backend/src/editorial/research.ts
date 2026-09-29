import { z } from "zod";
import { RESEARCH_FIELDS, PAYMENT_KINDS } from "@aihot/contracts/research";
import { collapseWhitespace } from "../lib/text.ts";
import type { AnalyzeInputArticle } from "./input.ts";

const fact = z.object({ text: z.string().trim().min(1).max(240), quote: z.string().trim().min(1).max(300), sourceId: z.string().max(80) }).strict().nullable();
const suggestion = z.string().trim().min(1).max(300).nullable();
export const ResearchSchema = z.object({
  facts: z.object({ user: fact, payer: fact, trigger: fact, outcome: fact, currentSolution: fact, gap: fact, cost: fact }).strict(),
  paymentKind: z.enum(Object.keys(PAYMENT_KINDS) as [keyof typeof PAYMENT_KINDS, ...(keyof typeof PAYMENT_KINDS)[]]),
  terms: z.array(z.string().trim().min(3).max(50)).max(6),
  suggestions: z.object({ experiment: suggestion, deliverable: suggestion, humanStep: suggestion, channel: suggestion, pricing: suggestion, risks: suggestion, searchTerms: z.array(z.string().trim().min(1).max(100)).max(3) }).strict(),
}).strict();
export type ResearchAssessment = z.infer<typeof ResearchSchema>;
export interface DiscussionComment { id: string; author: string | null; isOp: boolean; text: string; url: string; at: string }

export function researchSources(a: AnalyzeInputArticle) {
  const text = a.xPost ? String(a.xPost.text ?? "") : a.bodyText?.trim() || a.excerpt?.trim() || "";
  return [{ id: "post", text: `${a.title}\n${text.slice(0, 9000)}`, url: a.url }, ...(a.discussion?.comments ?? [])];
}

export function supportedQuote(quote: string, sourceId: string, a: AnalyzeInputArticle): boolean {
  const source = researchSources(a).find(s => s.id === sourceId);
  return !!quote.trim() && !!source && collapseWhitespace(source.text).includes(collapseWhitespace(quote));
}

const GENERIC = new Set("software tool tools help need needs problem problems work workflow want use using business people anyone someone looking solution solutions best time money paid app application have with that this from would could about thanks".split(" "));

/** The model proposes interpretations; missing/mismatched evidence is discarded, never repaired. */
export function assessResearch(raw: ResearchAssessment | undefined, a: AnalyzeInputArticle): ResearchAssessment | null {
  if (!raw || !(a.bodyText?.trim() || a.excerpt?.trim() || a.xPost?.text)) return null;
  const facts = { ...raw.facts };
  for (const key of Object.keys(RESEARCH_FIELDS) as Array<keyof typeof RESEARCH_FIELDS>) {
    const f = facts[key];
    const numbers = f?.text.match(/\d+(?:[,.]\d+)*/g) ?? [];
    if (!f || !supportedQuote(f.quote, f.sourceId, a) || numbers.some(n => !(f.quote.match(/\d+(?:[,.]\d+)*/g) ?? []).map(v => v.replaceAll(",", "")).includes(n.replaceAll(",", "")))) facts[key] = null;
  }
  const material = researchSources(a).map(s => s.text).join("\n").toLowerCase();
  const terms = [...new Set(raw.terms.map(t => t.toLowerCase()).filter(t => /^[a-z][a-z0-9 -]{2,49}$/.test(t) && !GENERIC.has(t) && material.includes(t)))];
  return { ...raw, facts, paymentKind: facts.cost ? raw.paymentKind : "unknown", terms,
    suggestions: facts.user || facts.gap || facts.outcome ? raw.suggestions : { experiment: null, deliverable: null, humanStep: null, channel: null, pricing: null, risks: null, searchTerms: [] } };
}
