import { Link } from "react-router";
import { RESEARCH_FIELDS, PAYMENT_KINDS, type ResearchView } from "@aihot/contracts/research";

export function ResearchPanel({ research: r, id }: { research: ResearchView; id: string }) {
  const advice = r.suggestions;
  return <section className="mt-8 space-y-5 border-t border-line pt-5" aria-label="购买理由与验证">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-[18px] font-semibold">购买理由与证据</h2>
      <span className="text-[12px] text-ink-3">五维中 {r.supportedDimensions}/5 有依据 · 不代表市场验证</span>
    </div>
    {r.facts ? <dl className="grid gap-4 sm:grid-cols-2">
      {Object.entries(RESEARCH_FIELDS).map(([key,label]) => {
        const f = r.facts![key as keyof typeof RESEARCH_FIELDS];
        return <div key={key} className="rounded-control bg-bg-sunk p-3">
          <dt className="text-[12px] text-ink-3">{label}</dt>
          <dd className="mt-1 text-[14px] leading-relaxed">{f ? <>{f.text} <a className="text-[12px] text-accent hover:underline" href={f.sourceUrl} target="_blank" rel="noopener noreferrer">{f.sourceId === "post" ? "原帖依据" : "评论依据"} ↗</a></> : <span className="text-ink-4">原文未提供</span>}</dd>
        </div>;
      })}
    </dl> : <p className="text-[14px] text-ink-3">等待后台按当前材料生成研究信息。</p>}
    <p className="text-[13px] text-ink-3">付款证据：{PAYMENT_KINDS[r.paymentKind]}。相关支出和委托预算不等于愿意购买新工具。</p>
    <p className="text-[12px] leading-relaxed text-ink-4">
      {r.discussion.checkedAt ? `评论采样 ${r.discussion.sampled} 条，更新于 ${new Date(r.discussion.checkedAt).toISOString().slice(0,16).replace("T"," ")} UTC。仅是部分评论，不能据此确认完整讨论。` : "尚未采集评论，解决状态需查看原文。"}
      {r.discussion.status === "failed" && " 最近刷新失败，保留上次成功的样本。"}
    </p>
    {advice && <details className="rounded-control border border-line p-4">
      <summary className="cursor-pointer text-[15px] font-medium">下一步怎么验证（建议，尚未证实）</summary>
      <dl className="mt-4 space-y-3 text-[14px]">
        {([["experiment","最小验证动作"],["deliverable","最小交付"],["humanStep","人工确认"],["channel","接触目标用户"],["pricing","收费方式假设"],["risks","待解决的问题"]] as const).map(([key,label])=> <div key={key}><dt className="text-[12px] text-ink-3">{label}</dt><dd className="mt-1 leading-relaxed">{advice[key] || "材料不足，需进一步了解"}</dd></div>)}
        {advice.searchTerms.length>0 && <div><dt className="text-[12px] text-ink-3">待验证的英语搜索词（未查询搜索量）</dt><dd className="mt-1">{advice.searchTerms.join(" · ")}</dd></div>}
      </dl>
    </details>}
    <div>
      <h3 className="text-[15px] font-medium">可能相似的问题</h3>
      <p className="mt-1 text-[12px] text-ink-4">按业务关键词寻找候选，需逐条确认是否相同需求。当前页及候选中有 {r.distinctAuthors} 个可区分的作者标识，不代表独立购买者数量。</p>
      {r.similar.length ? <ul className="mt-3 space-y-3">{r.similar.map(s=><li key={s.id} className="text-[14px]"><Link className="text-accent hover:underline" to={`/items/${s.id}`}>{s.title}</Link><span className="mt-1 block text-[12px] text-ink-4">{s.source} · {s.at.slice(0,10)}</span></li>)}</ul> : <p className="mt-2 text-[13px] text-ink-3">当前资料里尚无匹配候选。</p>}
    </div>
    <Link to={`/admin/research?article=${encodeURIComponent(id)}`} className="inline-flex rounded-control bg-ink px-4 py-2 text-[13px] text-bg">记录我的验证（管理员）</Link>
  </section>;
}
