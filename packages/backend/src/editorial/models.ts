// All content processing uses DeepSeek Flash. No provider or per-capability overrides.
export interface Capability {
  label: string;
  default: string;
  /** Receipt purposes this capability produces (for the admin statistics). */
  purposes: string[];
  vision?: boolean;
}

export const CAPABILITIES = {
  prefilter: { label: "精选预筛（是否属于这个行业，宽召回）", default: "deepseek-flash", purposes: ["prefilter_article"] },
  score: { label: "精选评分（两次独立评分，按信源分级门槛）", default: "deepseek-flash", purposes: ["score_article"] },
  understand: { label: "内容理解（入选和接近入选的标题、摘要、推荐理由、标签，能看图时看首图）", default: "deepseek-flash", purposes: ["understand_article"] },
  summarize: { label: "需求价值评估与中文摘要（每条资料一次调用）", default: "deepseek-flash", purposes: ["summarize_article"] },
  structure: { label: "结构抽取（分类、标签、主体公司、事件事实，不写读者文字）", default: "deepseek-flash", purposes: ["structure_article"] },
  group: { label: "事件归组（新报道与候选事实的关系：同一次发生、同一事件的进展、无关；被同一篇报道连起来的两个事件是否同一事件）", default: "deepseek-flash", purposes: ["group_article", "group_signal", "group_story"] },
  groupReview: { label: "归组复核（相似度不高的合并、两个事件的合并，写入前再读一遍）", default: "deepseek-flash", purposes: ["group_review", "group_story_review"] },
  digest: { label: "事件综述", default: "deepseek-flash", purposes: ["story_digest"] },
  report: { label: "日报、周报、月报", default: "deepseek-flash", purposes: ["report_lead", "report_daily", "report_weekly", "report_monthly"] },
  translate: { label: "精选全文翻译（含引用帖）", default: "deepseek-flash", purposes: ["translate_body", "translate_quoted"] },
  monitor: { label: "Codex 重置公告识别", default: "deepseek-flash", purposes: ["monitor.recognize", "monitor.context"] },
} satisfies Record<string, Capability>;

export type CapabilityKey = keyof typeof CAPABILITIES;

/** All capabilities use the single supported model; retired overrides cannot route requests elsewhere. */
export async function modelFor(_capability: CapabilityKey): Promise<string> {
  return "deepseek-flash";
}

export async function modelSources(): Promise<Record<string, { model: string; source: "default" }>> {
  return Object.fromEntries(Object.keys(CAPABILITIES).map((key) => [key, { model: "deepseek-flash", source: "default" as const }]));
}
