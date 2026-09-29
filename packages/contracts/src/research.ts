export const RESEARCH_FIELDS = {
  user: "什么人遇到问题", payer: "谁来付款", trigger: "发生场景", outcome: "想得到的结果",
  currentSolution: "现在怎么解决", gap: "仍未解决的部分", cost: "原文中的投入或预算",
} as const;
export const PAYMENT_KINDS = { unknown: "未提供付款证据", existing_spend: "现有工具或人工支出", hiring_budget: "招聘或委托预算", completed_payment: "已发生的付款", new_tool_budget: "明确的新工具预算" } as const;
export const RESEARCH_STATUS = { inbox: "待研究", researching: "研究中", testing: "验证中", done: "已记录结果", archived: "暂不继续" } as const;
export const RESEARCH_VERDICTS = { unrated: "尚未判断", pursue: "值得继续验证", pass: "不值得继续", paid: "已获得实际付款", not_paid: "验证后未付款" } as const;
export interface ResearchFact { text: string; sourceUrl: string; sourceId: string }
export interface ResearchSuggestions {
  experiment: string | null; deliverable: string | null; humanStep: string | null;
  channel: string | null; pricing: string | null; risks: string | null; searchTerms: string[];
}
export interface ResearchView {
  facts: Record<keyof typeof RESEARCH_FIELDS, ResearchFact | null> | null;
  paymentKind: keyof typeof PAYMENT_KINDS;
  supportedDimensions: number;
  suggestions: ResearchSuggestions | null;
  discussion: { sampled: number; partial: boolean; checkedAt: string | null; status: string };
  similar: Array<{ id: string; title: string; source: string; at: string; url: string }>;
  distinctAuthors: number;
}
export interface ResearchNote {
  id: string; articleId: string | null; title: string; status: keyof typeof RESEARCH_STATUS;
  verdict: keyof typeof RESEARCH_VERDICTS; notes: string; evidenceKind: keyof typeof PAYMENT_KINDS;
  evidence: string; sourceUrl: string; sourceDate: string; experiment: string; result: string;
  acquisition: string; pricing: string; version: number; updatedAt: string;
}
export interface ResearchNotebook {
  rows: ResearchNote[]; page: number; total: number; selected: ResearchNote | null;
  article: { id: string; title: string; url: string } | null;
  calibration: Array<{ verdict: string; count: number; averageScore: number | null }>;
}

/** Compact public home copy. Contains no private notes, quotes or comment bodies. */
export interface OpportunityPreview {
  status: "ready" | "pending" | "insufficient";
  idea: string | null;
  user: string | null;
  problem: string | null;
  currentSolution: string | null;
  payment: string | null;
  paymentKind: keyof typeof PAYMENT_KINDS;
  nextStep: string | null;
  evidenceCount: number;
}
