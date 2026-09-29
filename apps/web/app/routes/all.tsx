import { SITE } from "@aihot/industry/site";
import { data as withHeaders, Link, useLoaderData, useLocation, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/all";
import type { PoolResponse } from "@aihot/contracts/site";
import { loadOr404, releaseBoundCache } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { SearchField } from "../features/feed/Filters";
import { RankedList, Pagination } from "../features/feed/DayList";
import { EmptyState } from "../components/ui/Page";
import { RingMark } from "../components/Logo";

function queryString(params: Record<string, string | number | null>) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== null && value !== "") sp.set(key, String(value));
  return sp.size ? `?${sp}` : "";
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 200) || null;
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1), 50);
  const upstream = new Headers();
  const data = await loadOr404<PoolResponse>(`/api/site/pool${queryString({ q, page: page > 1 ? page : null })}`, {
    responseHeaders: upstream, signal: request.signal, busyRedirect: "/search-busy",
  });
  return withHeaders({ data }, { headers: releaseBoundCache(null, 60, Date.now(), upstream) });
}

export function meta({ loaderData }: Route.MetaArgs) {
  const q = loaderData?.data.filters.q;
  const page = loaderData?.data.page ?? 1;
  return pageMeta({ title: q ? `搜索：${q}` : "需求动态", description: SITE.description,
    path: `/${queryString({ q, page: page > 1 ? page : null })}`, noindex: !!q });
}

export function headers({ loaderHeaders }: Route.HeadersArgs) {
  return loaderHeaders;
}

export default function AllPage() {
  const { data } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const navigation = useNavigation();
  const q = data.filters.q;
  const busy = navigation.state === "loading";
  return (
    <div className="pb-6">
      <header className="mb-5 space-y-4 pt-5 lg:pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[24px] font-semibold text-ink">{q ? `搜索“${q}”` : "需求动态"}</h1>
          <span className="text-[12.5px] text-ink-4">{q ? "找到" : "已收录"} <span className="num">{data.total >= 2000 ? "2000+" : data.total}</span> 条 · 按需求价值排序</span>
        </div>
        <p className="text-[12.5px] text-ink-4">分数高的在前，同分按时间排序；暂无评分的内容排在后面。分数是研究线索，不代表市场已验证。</p>
        <SearchField action={pathname} variant="bar" defaultValue={q ?? ""} autoFocus={params.get("search") === "1"} />
      </header>
      <div className={`transition-opacity duration-200 ${busy ? "opacity-50" : ""}`}>
        {data.items.length === 0 ? (
          <div className="mt-2 lg:card"><EmptyState title={q ? "没有找到相关内容" : "暂时还没有动态"}>
            {q ? "换个关键词再试。" : "下一次采集完成后，内容会自动显示在这里。"}
          </EmptyState></div>
        ) : <RankedList items={data.items} />}
      </div>
      <Pagination page={data.page} pageCount={data.pageCount} href={(page) => `${pathname}${queryString({ q, page: page > 1 ? page : null })}`} />
      {data.page >= 50 && <p className="mt-4 text-center text-[12px] text-ink-4">最多提供 50 页，更早的内容请使用搜索。</p>}
    </div>
  );
}

export function SearchBusy() {
  return (
    <div className="mx-auto max-w-sm py-24 text-center">
      <RingMark className="mx-auto mb-5 size-10 text-accent" spinning />
      <h1 className="text-[20px] font-bold text-ink">搜索有点忙</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">请稍等几秒再试。列表浏览不受影响。</p>
      <Link to="/" className="mt-6 inline-flex text-accent">浏览需求动态</Link>
    </div>
  );
}
