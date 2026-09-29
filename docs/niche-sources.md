# 英语垂直需求信源

本次按「寻找不重复信源」对话最后一轮的清单配置，移除 `industry/sources.json` 中原有的 18 个 AI 示例源。10 个社区或服务对应 12 条信源：Signs101、PrintPlanet 各拆成两个指定板块。这里只完成采集入口配置，没有把站点整体改造成需求发现产品。

## 接入状态

2026-09-29 从当前开发机器读取论坛公开入口，Reddit 后续使用用户提供的 OAuth 应用权限接入；未使用浏览器或第三方付费采集服务。HTTP 200 之外，还检查了列表结构、帖子链接和原帖日期。访问状态可能随部署网络和上游策略改变。

| 来源 | 配置 ID | 状态与入口 |
|---|---|---|
| Signs101 · General Software | `web-signs101-software` | 启用：[公开板块](https://www.signs101.com/forums/general-software.150/)，网页列表 |
| Signs101 · Sales, Marketing, Pricing | `web-signs101-sales` | 启用：[公开板块](https://www.signs101.com/forums/sales-marketing-pricing-etc.304/)，网页列表 |
| PrintPlanet · Prepress and Workflow | `web-printplanet-prepress` | 启用：[公开板块](https://printplanet.com/forums/prepress-and-workflow-discussion.58/)，网页列表 |
| PrintPlanet · MIS, ERP and Workflow | `web-printplanet-mis` | 启用：[公开板块](https://printplanet.com/forums/mis-erp-and-workflow.62/)，网页列表 |
| Airhostsforum | `rss-airhostsforum` | 启用：[最新主题 RSS](https://airhostsforum.com/latest.rss)，包括 Tools 和日常运营讨论 |
| AccountingWEB · Any Answers | `external-accountingweb` | 待接入：[问答入口](https://www.accountingweb.co.uk/any-answers) 返回 403，仅保留外部导入占位 |
| Reddit · r/Bookkeeping | `rss-reddit-bookkeeping` | 启用：[社区](https://www.reddit.com/r/Bookkeeping/)，官方 OAuth JSON，已读取 50 条 |
| Reddit · r/WeddingPhotography | `rss-reddit-weddingphotography` | 启用：[社区](https://www.reddit.com/r/WeddingPhotography/)，官方 OAuth JSON，已读取 50 条 |
| Reddit · r/PropertyManagement | `rss-reddit-propertymanagement` | 启用：[社区](https://www.reddit.com/r/PropertyManagement/)，官方 OAuth JSON，已读取 50 条 |
| Reddit · r/EtsySellers | `rss-reddit-etsysellers` | 启用：[社区](https://www.reddit.com/r/EtsySellers/)，官方 OAuth JSON，已读取 50 条 |
| Upwork · Automation Jobs | `external-upwork-automation` | 待接入：[任务入口](https://www.upwork.com/freelance-jobs/automation/) 返回 403 验证页面 |
| Capterra · Software Reviews | `external-capterra` | 待接入：[分类入口](https://www.capterra.com/categories/) 返回 403；还需选择具体产品评价页 |

现在启用 9 条配置；AccountingWEB、Upwork、Capterra 这 3 个来源尚未自动接通。`external` 条目不是爬虫，不会自行抓取网站。它们默认暂停且设为 `isolated`，由有权访问资料的人或采集服务通过现有 [外部推送接口](sources.md#外部推送接口) 导入，确认内容后再在后台调整参与方式。

Reddit 已使用用户提供的应用凭据完成真实读取，4 个社区各返回 50 条。ID 保留 `rss-reddit-*` 以迁移已有记录，实际类型已改为 `json_list`，凭据只由后端读取；启用命令、代理设置和限制见 [Reddit 接入](reddit-ingestion.md)。

## 日期、去重和正文

- Signs101、PrintPlanet 的板块 RSS 使用最后回复时间作为 `pubDate`。因此改读网页列表中的 `.structItem-startDate time`，保留原帖时间；列表中的最新回复日期不用于新闻时间。只读取 `.structItem--thread` 下的主题标题链接，排除导航、用户主页及页码。
- Airhostsforum 只接一个最新主题订阅，避免同时订阅 Tools 与全站造成重叠。RSS 的正文供后端处理，公开页面仍只允许摘要和原文链接。
- 所有新源为 `T2`、`first_party: false`。论坛用户发言不等于平台的官方声明。`site_fulltext` 与 `syndicate_fulltext` 全部关闭。
- 首次导入最多 8 条，按原帖时间归档；保留框架原有 URL 判重和后续抓取机制。
- Reddit 每次取最新 50 条，使用讨论帖 permalink 作身份、`created_utc` 作日期、`selftext` 作正文。保持短帖正文，不需要再抓未登录网页。当前没有补抓列表之外的分页存量。
- 本次已与仓库原有 18 个示例源及新清单内部排重。没有原作者生产信源名单，不能宣称与其线上全部信源零重叠。
- 尚未实现分页读取全部评论、跟踪旧帖新增回复、独立用户计数或识别已解决状态。现有正文提取不保证完整保留回复与作者归属，不能据此把帖子判为“尚未满足的需求”。

## 导入和验证

Node.js 24.11 以上，安装项目已声明依赖后，在配置好的数据库上执行：

```bash
COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false node --env-file=.env scripts/migrate.ts
COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false node --env-file=.env scripts/seed.ts
```

`seed.ts` 只新增不存在的 ID，不覆盖管理员修改。**已有实例中的旧源不会因为修改 JSON 自动停止。** 本次工作区没有已配置的运行数据库；若将配置用于已有实例，先在后台停用原来的 18 个 AI 示例源。若旧内容也应退出公开页面，将旧源的参与方式改为 `isolated`，让现有重新发布任务更新公开出口；无需删除历史数据。

离线集成验证使用空的 `_test` 或 `_ci` 数据库，只访问本地 HTTP 测试服务：

```bash
DATABASE_URL=postgres://127.0.0.1:5432/niche_sources_test node scripts/migrate.ts
DATABASE_URL=postgres://127.0.0.1:5432/niche_sources_test \
  COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false \
  FEISHU_CONTENT_PUSH_ENABLED=false INDEXNOW_SUBMIT_ENABLED=false \
  node --test tests/niche-sources.test.ts
```

验证实际 seed 导入与幂等性、管理员修改保留、网页/RSS 经采集器入库、原帖日期、首次回灌、重复抓取和暂停状态。外网入口的读取记录保存在本机 `.data/niche-sources/`，不提交网页快照或数据库。

## 采集之后的筛选

`industry/prompts/`、`taxonomy.ts` 与评分门槛目前仍是 AI 示例行业的配置。接入这些来源不会自动改变预筛、分类或入选标准；非 AI 行业问题可能被过滤。这次没有擅自修改重要性标准、分类或门槛。正式用于找 niche 前，需要确认需求证据的筛选标准，再用标注样本校准，见 [精选与校准](selection.md)。
