# MyHOT · 行业需求观察

从英语垂直社区中整理从业者的实际问题、重复劳动、软件限制与自动化线索。

线上站点：[myhot-zeta.vercel.app](https://myhot-zeta.vercel.app/)

- 所有内容按需求价值分平级排序，同分按时间，暂无评分排在最后；不分类、不设精选、不隐藏低分内容。
- 来源包括 Signs101、PrintPlanet、Airhostsforum、四个 Reddit 社区；受限及待接入来源见 [信源状态](docs/niche-sources.md)。
- 模型统一为 DeepSeek Flash，摘要和需求评估只读取 `DEEPSEEK_API_KEY`。填写方式见 [DeepSeek 接入](docs/deepseek.md)。
- Vercel Hobby + Neon Free，每天东八区 00、06、12、18 点计划采集。免费定时任务可能延迟；平台额度与 DeepSeek 调用费用分别计算。
- 页面只显示摘要和原文链接；不把单人求助当作已验证的市场机会，不推断原文未给出的预算与付费意愿。

- 内容详情新增有出处的购买理由、现有方案、缺口、证据完整度与待验证建议。
- 首页使用面向新手的机会卡片，先看工具切口、用户、障碍与验证动作；原始线索明确标为待整理。见 [首页说明](docs/opportunity-home.md)。
- Reddit 评论有限量采样；相似线索只关联候选，首页不合并帖子。
- [需求验证后台](https://myhot-zeta.vercel.app/admin/research) 保存私人验证记录和手动线索，见 [使用说明](docs/demand-research.md)。

## 配置与运行

部署参考 [Vercel + Neon](docs/vercel-deployment.md)，本地配置模板为 [deploy/env.example](deploy/env.example)。密钥只放服务端环境变量，不提交到 Git。原来的通用 LLM、智谱、千问、MiMo 和额外向量接口已停用。

配置集中在 `industry/`：站名文案、信源与摘要提示词；`FEATURES.flatFeed=true` 固定启用平级展示，主题目录为空。模型榜、重置监控和 Agent 指南页面已关闭。站点目前保留匿名 RSS、公开 API 和 MCP 读取能力。

## 验证

要求 Node.js 24 和 PostgreSQL 17。测试数据库名必须以 `_test` 或 `_ci` 结尾，先执行 `scripts/migrate.ts`。模型测试只连接本地模拟服务，禁止外网。

```sh
npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/myhot_test npm test
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
node scripts/smoke.ts --base http://localhost:3000
node scripts/check-removed-features.ts http://localhost:3000
node scripts/check-niche-site.ts http://localhost:3000
node scripts/check-research-site.ts http://localhost:3000
node scripts/check-opportunity-home.ts http://localhost:3000
```

[需求评分](docs/selection.md) · [行业包维护](docs/customize.md) · [Reddit 接入](docs/reddit-ingestion.md)

项目基于原开源框架修改，原始许可与版权信息保留于 [LICENSE](LICENSE)。
