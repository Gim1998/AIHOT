import { SITE } from "@aihot/industry/site";
import { data as withHeaders, Link, useLoaderData, useLocation, useNavigation, useSearchParams } from "react-router";
import type { Route } from "./+types/all";
import type { PoolResponse } from "@aihot/contracts/site";
import { loadOr404, releaseBoundCache } from "../lib/api.server";
import { pageMeta } from "../lib/seo";
import { SearchField } from "../features/feed/Filters";
import { Pagination } from "../features/feed/DayList";
import { OpportunityCard } from "../features/feed/OpportunityCard";
import { IconArrowRight, IconArrowUpRight, IconBookmark, IconCheck, IconClock, IconChevronDown } from "../components/icons";
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
  return pageMeta({ title: q ? `搜索：${q}` : "发现产品机会", description: SITE.description,
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
  const ready = data.items.filter(item => item.opportunity?.status === "ready").length;
  const pending = data.items.filter(item => !item.opportunity || item.opportunity.status === "pending").length;
  return (
    <div className="opportunity-home">
      <header className="opportunity-hero">
        <div className="opportunity-hero-copy">
          <p className="opportunity-eyebrow"><span /> 从英语社区，寻找真实需求</p>
          <h1>{q ? <>寻找「{q}」的机会</> : <>你的第一个产品，<br /><em>从一个小问题开始。</em></>}</h1>
          <p className="opportunity-intro">看看谁遇到了麻烦、你能做什么小工具，<br className="hidden sm:block" />再用一个小行动，验证有没有人愿意付钱。</p>
          <div className="opportunity-hero-actions">
            <a href="#opportunities" className="opportunity-primary">浏览机会线索 <IconArrowRight size={17} /></a>
            <Link to="/starred" className="opportunity-secondary"><IconBookmark size={16} />我的收藏</Link>
          </div>
        </div>
        <details className="opportunity-start">
          <summary>
            <p className="opportunity-start-eyebrow">第一次来？查看 3 步入门 <IconChevronDown size={15} /></p>
            <h2 className="hidden lg:block">今天，先找到一个<br />你能看懂的问题。</h2>
          </summary>
          <ol>
            <li><span>01</span><div><strong>看懂谁需要</strong><p>找你熟悉的人群和工作场景。</p></div></li>
            <li><span>02</span><div><strong>想清楚交付什么</strong><p>先解决一个步骤，再考虑做大。</p></div></li>
            <li><span>03</span><div><strong>问一个真实用户</strong><p>确认他现在怎么做、愿意付什么代价。</p></div></li>
          </ol>
          <Link to="/admin/research" className="opportunity-start-link">打开我的验证记录 <IconArrowUpRight size={16} /></Link>
        </details>
      </header>
      <section id="opportunities" className="opportunity-list-heading">
        <div><h2>{q ? "找到的线索" : "值得你继续研究的线索"}</h2><p>共 {data.total >= 2000 ? "2000+" : data.total} 条 · 按需求价值排序 · 本页 {ready} 条已整理为机会草稿</p></div>
        <span className="opportunity-cadence"><IconClock size={14} /> 每天更新 4 次</span>
      </section>
      <div className="opportunity-search"><SearchField action={pathname} variant="bar" label="搜索机会与原始线索" placeholder="搜索人群、问题或工具，如 invoice、Etsy…" defaultValue={q ?? ""} autoFocus={params.get("search") === "1"} /></div>
      {pending > 0 && <div className="opportunity-notice" role="status"><IconClock size={17} /><p><strong>{ready === 0 ? "这页还是原始线索，机会草稿正在等待整理。" : `本页还有 ${pending} 条原始线索等待整理。`}</strong><span>整理后会直接看到“小工具切口、谁会用、卡在哪、第一步怎么验证”。目前仍可查看原帖或收藏，等待后续任务补齐。</span></p></div>}
      <div aria-busy={busy} className={`transition-opacity duration-200 ${busy ? "opacity-50" : ""}`}>
        {data.items.length === 0 ? (
          <div className="mt-2 lg:card"><EmptyState title={q ? "还没找到这样的线索" : "第一批线索还在路上"}>
            {q ? "试试更具体的工具名或问题描述，也可以使用英语关键词。" : "采集完成后，真实的社区问题会出现在这里。"}
          </EmptyState></div>
        ) : <ol className="opportunity-grid" aria-label="按需求价值排序的机会线索">{data.items.map((item,index)=><li key={item.id}><OpportunityCard item={item} index={(data.page-1)*40+index+1} /></li>)}</ol>}
      </div>
      <Pagination page={data.page} pageCount={data.pageCount} href={(page) => `${pathname}${queryString({ q, page: page > 1 ? page : null })}`} />
      {data.page >= 50 && <p className="mt-4 text-center text-[12px] text-ink-4">最多提供 50 页，更早的内容请使用搜索。</p>}
      <p className="opportunity-footer-note"><IconCheck size={14} />保留原始出处。点子是待验证的假设，分数不代表收入或成功概率。</p>
    </div>
  );
}

export function SearchBusy() {
  return (
    <div className="mx-auto max-w-sm py-24 text-center">
      <RingMark className="mx-auto mb-5 size-10 text-accent" spinning />
      <h1 className="text-[20px] font-bold text-ink">搜索有点忙</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-3">请稍等几秒再试。列表浏览不受影响。</p>
      <Link to="/" className="mt-6 inline-flex text-accent">浏览机会线索</Link>
    </div>
  );
}
