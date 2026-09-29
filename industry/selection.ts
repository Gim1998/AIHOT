// 历史编辑模式的兼容常量，仅用于旧数据/回归测试；当前需求排序不使用这些门槛。
export const SELECTION = {
  /**
   * 信源分级 → 入选门槛（平均分）。分级在后台“信源”里给每个源设置：
   *   T1 官方一手（官网、官方博客、机构）· T1_5 官方账号、准官方创作者 · T2 媒体与个人
   * 分级 EXCLUDE_MP 以及这里没有列出的分级，不参与精选评分（只进“全部动态”）。
   */
  thresholds: { T1: 60, T1_5: 65, T2: 76 } as Record<string, number>,
  /**
   * 没入选、但平均分高于这个数的资料，也用精选的写法（内容理解：标题、摘要、推荐理由、标签）来写，
   * 其余用更便宜的“标题摘要翻译”。
   */
  understandFloor: 50,
} as const;

/** 当前需求价值分。只用于排序，无信源级别加成、精选门槛或隐藏规则。 */
export const DEMAND_SCORING = {
  axes: {
    problem: "具体场景", pain: "重复成本", gap: "方案缺口", commercial: "付费证据", scope: "小切口明确度",
  },
  // 每行合计 10；每维 0–10，后端据此算出 0–100，不接受模型直接报总分。
  weights: {
    workflow_pain:     { problem: 3, pain: 3, gap: 2, commercial: 1, scope: 1 },
    software_update:   { problem: 2, pain: 2, gap: 3, commercial: 1, scope: 2 },
    automation_recipe:{ problem: 2, pain: 2, gap: 2, commercial: 1, scope: 3 },
    cost_evidence:     { problem: 2, pain: 3, gap: 2, commercial: 2, scope: 1 },
    platform_change:   { problem: 2, pain: 3, gap: 2, commercial: 1, scope: 2 },
    experience_report:{ problem: 2, pain: 2, gap: 3, commercial: 2, scope: 1 },
    how_to:            { problem: 3, pain: 2, gap: 2, commercial: 1, scope: 2 },
  },
} as const;
