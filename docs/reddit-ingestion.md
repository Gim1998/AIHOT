# Reddit 接入

2026-09-29：用户已有 API 权限，本次采用官方 OAuth Data API。四个社区已各读取 50 条帖子：`Bookkeeping`、`WeddingPhotography`、`PropertyManagement`、`EtsySellers`。真实读取记录位于本机 `.data/reddit-integration/live-preview.log`，没有保存 token。

## 路线选择

| 路线 | 结论 |
|---|---|
| 未登录 RSS | 本机曾返回 403；补查一度读到 25 条，随后又返回 429。不作为主要采集路线。 |
| 官方 OAuth API | 当前采用。复用已批准的应用，读取结构化帖子，支持 token 续期及限流处理。 |
| 第三方 RSS/采集服务 | 没有购买或接入。已有官方权限时，没有必要增加中转服务与依赖。 |

[Reddit 官方 API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki) 要求 OAuth 认证、可识别的 User-Agent，并提供限流响应头；匿名流量可能被限制。官方 [API 文档](https://www.reddit.com/dev/api/#GET_new) 的 `/r/{subreddit}/new` 列表支持 `read` 权限，单页最多 100 条。本项目每次读取 50 条，每个社区初始间隔 60 分钟，首次只入库 8 条。

认证依据官方链接的 [OAuth 技术文档](https://github.com/reddit-archive/reddit/wiki/OAuth2)：服务端保密应用使用 `client_credentials`；已有用户授权时可以用 `refresh_token`。token 按实际返回的 `expires_in` 缓存，提前续期，并发请求共享一次 token 获取；401 只重取 token 并重试一次。

## 后端凭据

后端读取 `.env` 或 `AIHOT_CREDENTIALS_DIR/collectors.env` 中的变量：

```dotenv
REDDIT_CLIENT_ID=<已批准应用的 client ID>
REDDIT_CLIENT_SECRET=<应用 secret>
REDDIT_USERNAME=<用于联系标识的 Reddit 用户名>
# 可选：覆盖自动生成的 User-Agent
# REDDIT_USER_AGENT=server:my-reader:v1.0 (by /u/your_username)
# 可选：已有 read 权限的用户授权 refresh token
# REDDIT_REFRESH_TOKEN=<refresh token>
```

`REDDIT_USERNAME` 用于 User-Agent，不会使用账号密码登录。实际 `.env` 已经用户批准，将原有三个小写字段重命名，值保持不变。不要把凭据放入 `industry/sources.json`、前端、命令行参数或提交记录。

## 预览与已有实例迁移

新实例在配置凭据后按通常方式执行迁移与 seed。已有实例中，`seed.ts` 不会覆盖旧 RSS 配置；运行以下专用命令：

```bash
# 只验证读取，不写数据库，不调用模型
COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false \
  node --env-file=.env scripts/connect-reddit.ts

# 四个社区全部返回帖子后，才在一次事务中切换并启用对应信源
COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false \
  node --env-file=.env scripts/connect-reddit.ts --apply
```

`--apply` 要求显式配置 `DATABASE_URL`，保留原有 `rss-reddit-*` ID、历史文章和已有参与方式，并记录操作日志。切换类型或配置时重置抓取游标，让现有首次回灌规则处理存量；任何一个社区验证失败都不会执行数据库变更。

本机通过现有 `HTTPS_PROXY` 指向的本地代理成功连接。项目的采集 HTTP 层使用 `EGRESS_PROXY_URL`，不会自动读取 `HTTPS_PROXY`；无需修改持久配置，可给单次命令设置：

```bash
EGRESS_PROXY_URL="$HTTPS_PROXY" COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false \
  node --env-file=.env scripts/connect-reddit.ts
```

以上代理只用于开发机器的连通性验证。用户已明确目标是 Vercel 线上部署，因此没有将本地代理地址写入 `.env`；线上不能配置 `127.0.0.1:7890` 指向开发机器。

Vercel 部署时，将 `REDDIT_CLIENT_ID`、`REDDIT_CLIENT_SECRET`、`REDDIT_USERNAME` 设置为后端环境变量，不使用公开前缀，不上传 `.env`。本机的 OAuth 成功记录不能替代 Vercel 出口网络的实际验证。当前尚未部署 Vercel，也未启动持续采集。

当前项目的常驻 worker、数据库和磁盘存储还需要独立处理，见 [Vercel 部署约束](vercel-deployment.md)。

## 数据与边界

- URL 使用 Reddit 讨论帖 permalink，避免把用户链接到的外站文章误认成帖子。`created_utc` 保留原帖日期，`selftext` 保留短帖正文。公开全文权限仍关闭。
- 当前接入帖子列表和主帖正文，不抓评论树、不判断问题是否已解决，也不补齐停机期间超过 50 条的积压。站点分类与评分提示词现已改为行业需求观察，详见 [DeepSeek 接入](deepseek.md)。
- `Retry-After`（秒数或 HTTP 日期）和 `X-Ratelimit-*` 控制共享冷却；采集调度持久保存不早于重试时间的下次抓取时间。失败不推进成功游标。
- token 和带认证的 API 请求禁止跟随重定向；错误信息不保存上游响应正文。测试端点覆盖只允许显式开启本地网络访问的开发进程连接 loopback，生产只能使用官方端点。
- Reddit [访问说明](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data) 区分用途与授权范围；已有 API 权限不自动扩展到未批准用途。其 [API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki) 还要求同步删除已删除内容。本次没有新增全站数据保留或删除同步机制，正式长期保存或公开发布需把该机制纳入运营流程。

## 离线检查

`tests/reddit.test.ts` 使用本地 HTTP 服务模拟 OAuth 与帖子列表，验证缺失凭据、并发 token 复用、refresh token、401、限流、禁止重定向、错误脱敏，以及真实采集器入库和重复抓取。外网读取是独立的接入预览，不属于自动化测试。

```bash
DATABASE_URL=postgres://127.0.0.1:5432/reddit_test node scripts/migrate.ts
DATABASE_URL=postgres://127.0.0.1:5432/reddit_test \
  COLLECT_ENABLED=false MODEL_CALLS_ENABLED=false \
  node --test tests/reddit.test.ts tests/niche-sources.test.ts
```
