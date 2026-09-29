# DeepSeek Flash 接入

本项目模型调用只使用 DeepSeek 官方 `https://api.deepseek.com/chat/completions`，模型名固定为 `deepseek-flash`（当前为 DeepSeek V4.1 Flash），无需填写 Base URL 或为各步骤选择模型。结构化请求使用 JSON Output，默认关闭思考以控制延迟，当前仅使用文本生成标题和摘要。

## 在 Vercel 填 API Key

1. 在 [DeepSeek 控制台](https://platform.deepseek.com/api_keys) 创建 API Key。不要把密钥发在聊天中或写进 Git。
2. 打开 [myhot 环境变量](https://vercel.com/gimnz1998s-projects/myhot/settings/environment-variables)，选择 **Production**。
3. 新增 `DEEPSEEK_API_KEY`，值为刚复制的完整 Key（通常以 `sk-` 开头），不要加引号。将 `MODEL_CALLS_ENABLED` 改为 `true`。
4. 保存后在 **Deployments** 对最新版本执行 **Redeploy**，使新变量生效。
5. 在站点后台“模型与评测”确认“API Key 已配置 / 模型调用已开启”。这只检查配置存在，不代表 Key 有效或余额充足；下一轮任务的回执才确认真实调用。

采集仍是东八区 00、06、12、18 点的四条每日任务，免费调度可能延迟。启用模型后，后台会分批处理积压内容，不会立即处理完全部存量。若需要立即执行一次，可以在 Vercel 的 Cron Jobs 页面手动运行已有任务；同一六小时时段成功执行过会被防重保护跳过。

`DEEPSEEK_API_KEY` 只在服务端环境变量中保存；后台不会显示值，也没有网页输入密钥的接口。保持 `NODE_OPTIONS=--experimental-require-module`，它用于现有依赖在 Vercel 上正常加载。

## 移除的模型接口

通用 LLM 配置、智谱、DashScope/千问、MiMo 以及额外 Embedding API 不再参与调用；旧的 per-step 环境选择或数据库模型选择不会把请求切换到其他供应商。后台模型切换写接口已移除。平级信息流不调用向量或事件归组接口。

Reddit OAuth 属于信源采集，保留其 CLIENT_ID / CLIENT_SECRET / USERNAME。数据库、会话和 Cron 密钥同样保留。

## 费用与安全阀

DeepSeek 按 token 用量收费，费用独立于 Vercel Hobby 和 Neon Free。调用仍经过回执、请求预算和未知结果保护；失败或超时不会直接无限重发。`MODEL_CALLS_ENABLED=false` 会停止所有模型调用。后台预算页可以调整 DeepSeek 的分钟、小时和每日请求上限，这些是请求数限制，不是人民币金额上限。

所有上线前自动化测试使用本地模拟接口且由系统沙箱禁止外网。没有真实 Key 时不能宣称完成真实 DeepSeek 请求验证。

## 内容规则

所有采集内容按时间平级展示，没有分类、标签、评分或精选层级。来源允许公开的摘要与原文链接会立即显示，未配置模型也不会空白。配置 Key 后，DeepSeek 每条一次请求补充中文标题和摘要；失败时保留原始内容，按回执与预算规则重试。

单人抱怨不代表市场规模，没有明确预算或支出不推断付费意愿。隔离信源和管理员撤回的内容仍不可公开。

## 官方依据

- [首次调用 API](https://api-docs.deepseek.com/zh-cn/)
- [模型与价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
- [JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode/)
