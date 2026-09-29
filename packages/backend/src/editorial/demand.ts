// Demand scores are computed from evidence-bearing dimensions, never a model-supplied total.
import { z } from "zod";
import { DEMAND_SCORING } from "@aihot/industry/selection";
import { sha256 } from "../lib/ids.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { promptText } from "./prompts.ts";
import type { AnalyzeInputArticle } from "./input.ts";

export const DEMAND_AXES = ["problem", "pain", "gap", "commercial", "scope"] as const;
export const DEMAND_TYPES = ["workflow_pain", "software_update", "automation_recipe", "cost_evidence", "platform_change", "experience_report", "how_to"] as const;
export const DEMAND_WEIGHTS = Object.entries(DEMAND_SCORING.weights).map(([type, weights]) =>
  `${type}: ${DEMAND_AXES.map(axis => `${axis}×${weights[axis]}`).join(" + ")}`,
).join("\n");
export const DEMAND_SYSTEM = promptText("flat-summary", { demandWeights: DEMAND_WEIGHTS });
export const DEMAND_VERSION = `demand-v1:${sha256(DEMAND_SYSTEM).slice(0, 16)}`;
const dimension = z.object({ value: z.number().int().min(0).max(10).nullable(), evidence: z.string().trim().min(1).max(300).nullable() }).strict();
const dimensions = z.object({ problem: dimension, pain: dimension, gap: dimension, commercial: dimension, scope: dimension }).strict();
export const DemandSchema = z.object({ itemType: z.enum(DEMAND_TYPES), noise: z.enum(["none", "promotion", "resolved", "unrelated"]), dimensions }).strict();
export const DemandAnalysisSchema = z.object({
  titleZh: z.string().trim().min(1).max(200), summaryZh: z.string().trim().min(1).max(1600), demand: DemandSchema,
}).strict();
export interface DemandAssessment {
  version: string;
  score: number | null;
  reason: string;
  itemType: z.infer<typeof DemandSchema>["itemType"];
  noise: z.infer<typeof DemandSchema>["noise"];
  dimensions: z.infer<typeof dimensions>;
  material: "body" | "excerpt" | "title";
}

/** The score never receives source prestige, previous scores or social popularity. */
export function demandMaterial(a: AnalyzeInputArticle) {
  const body = a.xPost ? String(a.xPost.text ?? "") : a.bodyText?.trim() || a.excerpt?.trim() || "";
  const material = body ? a.bodyText?.trim() || a.xPost ? "body" : "excerpt" : "title";
  return { title: a.title, text: body.slice(0, 9000), material } as const;
}

export function assessDemand(raw: z.infer<typeof DemandSchema>, a: AnalyzeInputArticle): DemandAssessment {
  const input = demandMaterial(a);
  const haystack = collapseWhitespace(`${input.title}\n${input.text}`);
  const checked = { ...raw.dimensions };
  let supported = 0;
  let score = 0;
  for (const axis of DEMAND_AXES) {
    const d = raw.dimensions[axis];
    // Exact excerpt membership prevents fabricated budgets/frequencies from earning points.
    const valid = input.material !== "title" && d.value !== null && !!d.evidence && haystack.includes(collapseWhitespace(d.evidence));
    checked[axis] = valid ? { value: d.value, evidence: d.evidence } : { value: null, evidence: null };
    if (valid) { supported++; score += d.value! * DEMAND_SCORING.weights[raw.itemType][axis]; }
  }
  const suppressed = raw.noise !== "none";
  const value = input.material === "title" || (!supported && !suppressed) ? null : suppressed || checked.problem.value === null || checked.problem.value === 0 ? 0 : score;
  const noiseNotes = { none: "", promotion: "仅见推广，未见独立用户需求证据。", resolved: "材料明确表示问题已解决，未见剩余缺口。", unrelated: "未见相关业务工具需求。" };
  const reason = input.material === "title" ? "来源只提供标题，缺少正文依据，暂不评分。"
    : value === null ? "当前材料不足以支持需求评估，暂不评分。"
    : `${noiseNotes[raw.noise]}${DEMAND_AXES.map(axis => `${DEMAND_SCORING.axes[axis]} ${checked[axis].value === null ? "未提供" : `${checked[axis].value}/10`}`).join("；")}。仅依据当前材料，不代表市场已验证。`;
  return { version: DEMAND_VERSION, score: value, reason, itemType: raw.itemType, noise: raw.noise, dimensions: checked, material: input.material };
}

/** Old attention scores and obsolete rubrics cannot appear as current demand scores. */
export function currentDemand(value: unknown): DemandAssessment | null {
  if (!value || typeof value !== "object") return null;
  const d = value as DemandAssessment;
  if (d.version !== DEMAND_VERSION || typeof d.reason !== "string" || !(d.score === null || (Number.isInteger(d.score) && d.score >= 0 && d.score <= 100))) return null;
  return d;
}
