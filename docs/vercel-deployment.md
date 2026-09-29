# Vercel Hobby + Neon Free 部署

目标是个人使用、每天四次采集，不使用常驻 worker、本地代理或付费服务。`vercel.json` 使用四条每日 Cron，目标为东八区 00、06、12、18 点。Hobby 为小时级 best effort 调度，可能延迟、漏发或重复，并非严格每隔六小时。

## 部署方式

1. 在 Neon Free 新建 PostgreSQL 17 数据库，区域与 Vercel 的 `iad1` 对齐；算力固定 0.25 CU，空闲五分钟休眠。
2. 在安全环境提供 `DATABASE_URL`，运行 `node --env-file=<私密环境文件> scripts/prepare-vercel-db.ts`。初始化迁移、行业种子及 pg-boss 表结构；不在构建或请求中执行迁移。
3. 在 Vercel Hobby 从仓库根目录部署。`npm ci` 安装已声明依赖，构建网页后 `scripts/build-vercel.ts` 按明确清单生成 Build Output API 的网页、API、Cron 三个函数。Node.js 24 原生运行 TypeScript，不包含 `.env`、`.data` 或 Git 元数据。
4. 配置服务端环境变量：`DATABASE_URL`、`REDDIT_CLIENT_ID`、`REDDIT_CLIENT_SECRET`、`REDDIT_USERNAME`、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET`、`ADMIN_PASSWORD`、`CRON_SECRET`。后三类安全密钥使用随机强值，管理员密码至少 12 字符，Cron 密钥至少 32 字符。
5. 采集上线设 `COLLECT_ENABLED=true`；默认 `MODEL_CALLS_ENABLED=false`，两个飞书开关及 `INDEXNOW_SUBMIT_ENABLED` 均为 false。不要设置本机代理地址。站点与 API 地址从 Vercel 生产域名自动推导。

## 运行和免费额度保护

- 所有启用信源初始间隔为 360 分钟，自动频率调整也不会降到六小时以下。
- Cron 需要 Bearer secret，使用数据库租约防止重叠及同一时段重复采集。
- 每轮最多 240 秒；HTTP 请求继承剩余时限。任务状态保留在数据库，下轮继续处理。
- 不创建后台轮询；按需手动维护、取出 pg-boss 任务，结束后关闭任务连接池。普通查询空闲 20 秒后断开。
- 数据库达到 350 MiB 时暂停采集，在 Neon 0.5 GB 免费存储上限前留出余量。后台其他写入仍会占空间，平台免费硬限额仍为最终约束。
- 不自动升级套餐。额度耗尽可能暂停服务；不能保证无限数据量或访问量永久免费。

## 当前功能边界

模型关闭时，只采集资料进入后台，等待后续筛选、摘要和归组；不把原始资料伪装成已完成的公开内容。模型 API 费用不属于 Vercel/Neon 免费额度。本行业仍沿用模板的分类与模型提示词，启用模型前应按实际行业校准。

Vercel 的临时磁盘只承载缓存。当前部署明确拒绝反馈截图和后台二维码上传；文字反馈可用，二维码可随行业品牌文件部署。未接入付费对象存储。日报、媒体等常驻 worker 功能不自动因部署而完整启用。

## 验证

部署前运行项目要求的 typecheck、独立测试数据库完整测试、网页构建与网页测试；在打包后的真实 HTTP 入口运行 `scripts/smoke.ts`。上线后再验证健康接口、网页、管理员登录、Cron 鉴权及四个 Reddit 社区的云端采集结果。

2026-09-29 本机：完整数据库测试 145/145，通过禁止外网的系统沙箱执行；网页测试 11/11；三个函数各约 155 MiB；打包入口 smoke 全部通过。云端结果以实际部署记录为准。

## 平台依据

- [Vercel Cron 限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)：Hobby 每条任务最多每天一次；可以设置四条每日任务。
- [管理 Cron](https://vercel.com/docs/cron-jobs/manage-cron-jobs)：支持多个时间表调用同一入口。
- [Vercel 函数限制](https://vercel.com/docs/functions/limitations)：Hobby Fluid Compute 最长 300 秒。
- [Neon 套餐](https://neon.com/docs/introduction/plans)：Free 每项目 100 CU-hours/月、0.5 GB 存储、5 GB/月出站流量，空闲五分钟后休眠。
- [Hobby 使用条件](https://vercel.com/docs/plans/hobby)：个人非商业用途。
