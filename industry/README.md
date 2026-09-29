# 当前行业包

MyHOT 从英语垂直社区收集实际业务问题，所有资料按需求价值分平级排序，没有分类、标签或精选层级。

- `site.ts`：站名与站点文案。
- `sources.json`：信源初始配置。
- `features.ts`：启用 `flatFeed`，关闭模型榜、重置监控和 Agent 指南。
- `prompts/flat-summary.md`：DeepSeek 中文标题和摘要规则。
- `topics.json`：空目录，停用旧主题。
- `pages/`、`brand/`、`changelog.json`：条款、品牌和更新日志。

需求评分由 `selection.ts` 的 `DEMAND_SCORING` 和 `prompts/selection-score.md` 维护；旧新闻门槛不参与当前处理。维护步骤见 [当前配置](../docs/customize.md)，接入状态见 [信源说明](../docs/niche-sources.md)。
