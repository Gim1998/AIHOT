# 维护当前站点

MyHOT 面向英语垂直社区的行业需求观察。当前采用平级信息流：采集即公开标题、来源摘要和原文链接；DeepSeek 补充中文标题、摘要与需求维度；后端计算需求价值分用于排序，不分精选、不分类、不归组。

- `industry/site.ts`：站名与页面文案。站名仍为用户确认的 MyHOT。
- `industry/sources.json`：信源目录。已上线信源的启停和采集配置在后台维护；当前状态见 [信源说明](niche-sources.md)。
- `industry/features.ts`：`flatFeed=true`；模型榜、重置监控和 Agent 指南已关闭。
- `industry/topics.json`：空主题目录。重新 seed 会停用旧主题，保留历史行。
- `industry/prompts/flat-summary.md`：当前文章处理入口提示词，引用 `selection-score.md` 的需求评估规则。描述角色、步骤、软件与证据，不推断原文未提供的预算、市场规模或付费意愿。
- `industry/pages/`、`industry/changelog.json`：条款、隐私与更新日志。
- `industry/selection.ts` 的 `DEMAND_SCORING`：需求价值五维权重；当前规则见 [需求评分](selection.md)。旧新闻门槛仅为历史模式保留，不进入当前流水线。

所有公开出口从 `packages/backend/src/publication/` 读取。隔离信源、管理员撤回、版权与全文授权边界仍生效。中文处理失败时继续显示原文标题和来源摘要。

模型仅使用 DeepSeek Flash。填写 Key 及费用说明见 [DeepSeek 接入](deepseek.md)。部署使用 [Vercel Hobby + Neon Free](vercel-deployment.md)，四条每天一次的任务覆盖东八区 00、06、12、18 点；免费调度可能延迟。

变更后按 AGENTS.md 跑类型检查、数据库测试、网页构建与 HTTP smoke；平级信息流检查命令为 `node scripts/check-niche-site.ts <站点地址>`。
