import { SITE } from "@aihot/industry/site";
import type { Route } from "./+types/models";
import { adminGet } from "../../lib/admin.server";
import { money, num } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, Empty, FilterChips } from "../../features/admin/ui";

interface Usage {
  purpose: string;
  model: string | null;
  promptVersion: string | null;
  calls: number;
  ok: number;
  failed: number;
  unknown: number;
  p50: number | null;
  p95: number | null;
  tokensIn: number;
  tokensOut: number;
  actualCost: number | null;
  currency: string | null;
  estimate: { amount: number; currency: string } | null;
}

interface Models {
  days: number;
  provider: { name: string; model: string; keyConfigured: boolean; callsEnabled: boolean };
  capabilities: Array<{ key: string; label: string; env: string; defaultModel: string; vision: boolean; current: { model: string; source: "admin" | "env" | "default" }; usage: Usage[] }>;
  choices: Array<{ key: string; service: string; vision: boolean }>;
  history: Array<{ at: string; actor: string; subject: string; reason: string | null; before: { model: string; source: string } | null; after: { model: string; source: string } | null }>;
  benches: Array<{ id: string; label: string; sample_size: number; prompt_version: string | null; models: string[]; created_at: string }>;
}

export async function loader({ request }: Route.LoaderArgs) {
  const days = new URL(request.url).searchParams.get("days") ?? "7";
  return adminGet<Models>(request, `/api/admin/models?days=${encodeURIComponent(days)}`);
}

export const meta: Route.MetaFunction = () => [{ title: `模型 · ${SITE.name} 后台` }];

const SOURCE_LABEL = { admin: "后台切换", env: "环境变量", default: "统一配置" } as const;
const secs = (ms: number | null) => (ms == null ? "—" : ms >= 10_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

export default function ModelsAdmin({ loaderData: m }: Route.ComponentProps) {

  return (
    <AdminPage
      title="模型"
      subtitle="DeepSeek Flash 只整理中文标题和摘要。这里查看配置状态、调用成功率、耗时和用量。"
      actions={<FilterChips param="days" options={[{ value: "1", label: "24 小时" }, { value: "", label: "7 天" }, { value: "30", label: "30 天" }]} />}
    >
      <Card title="DeepSeek Flash">
        <p className="text-sm text-ink-2">所有处理步骤统一使用 deepseek-flash。请在 Vercel 的生产环境变量中填写 DEEPSEEK_API_KEY，并将 MODEL_CALLS_ENABLED 设为 true 后重新部署。密钥不会在这里显示。</p>
        <p className="mt-2 text-sm">API Key：{m.provider.keyConfigured ? "已配置" : "未配置"} · 模型调用：{m.provider.callsEnabled ? "已开启" : "已关闭"}</p>
        <p className="mt-2 text-sm text-ink-3">DeepSeek 按用量计费。每条资料一次摘要请求，不再评分、分类或事件归组。</p>
      </Card>
      <div className="mt-5 grid gap-5">
        {m.capabilities.map((c) => {
          const total = c.usage.reduce((a, u) => a + u.calls, 0);
          return (
            <Card
              key={c.key}
              title={
                <span className="inline-flex flex-wrap items-center gap-2">
                  {c.label}
                  <span className="font-mono text-[12px] font-normal text-ink-3">{c.current.model}</span>
                  <Badge tone={c.current.source === "admin" ? "accent" : "muted"}>{SOURCE_LABEL[c.current.source]}</Badge>
                </span>
              }
              pad={false}
            >
              {c.usage.length ? (
                <DataTable
                  dense
                  rows={c.usage}
                  rowKey={(u) => `${u.purpose}|${u.model}|${u.promptVersion}`}
                  columns={[
                    { key: "m", label: "模型", render: (u) => <span className="whitespace-nowrap font-mono text-[12px]">{u.model}</span> },
                    { key: "v", label: "提示版本", render: (u) => <span className="whitespace-nowrap font-mono text-[11.5px] text-ink-3">{u.promptVersion ?? "—"}</span> },
                    { key: "p", label: "用途", render: (u) => <span className="whitespace-nowrap font-mono text-[11.5px] text-ink-3">{u.purpose}</span> },
                    { key: "c", label: "调用", align: "right", render: (u) => num(u.calls) },
                    {
                      key: "ok",
                      label: "成功率",
                      align: "right",
                      render: (u) => {
                        const rate = u.calls ? u.ok / u.calls : 0;
                        return <span className={rate < 0.95 ? "text-hot" : ""} title={`失败 ${u.failed} · 结果未知 ${u.unknown}`}>{`${Math.round(rate * 1000) / 10}%`}</span>;
                      },
                    },
                    { key: "l", label: "耗时 p50 / p95", align: "right", render: (u) => <span className="whitespace-nowrap">{`${secs(u.p50)} / ${secs(u.p95)}`}</span> },
                    { key: "t", label: "输入 / 输出 token", align: "right", render: (u) => <span className="whitespace-nowrap">{`${num(u.tokensIn)} / ${num(u.tokensOut)}`}</span> },
                    {
                      key: "$",
                      label: "费用",
                      align: "right",
                      render: (u) =>
                        u.actualCost !== null ? (
                          `${money(u.actualCost)}${u.currency && u.currency !== "CNY" ? ` ${u.currency}` : ""}`
                        ) : u.estimate ? (
                          <span title="按用量 × 单价推算">≈ {money(u.estimate.amount)}{u.estimate.currency !== "CNY" ? ` ${u.estimate.currency}` : ""}</span>
                        ) : (
                          <span className="whitespace-nowrap text-ink-4" title="服务商没有返回费用，按 token 数和你的模型单价自己估算">未定价</span>
                        ),
                    },
                  ]}
                />
              ) : (
                <Empty>{m.days} 天内没有调用{total === 0 && c.vision ? "（只在有图片时使用）" : ""}</Empty>
              )}
            </Card>
          );
        })}
      </div>

    </AdminPage>
  );
}
