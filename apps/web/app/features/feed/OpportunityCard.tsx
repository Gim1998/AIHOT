import { Link } from "react-router";
import type { FeedItemSummary } from "@aihot/contracts/site";
import { PAYMENT_KINDS } from "@aihot/contracts/research";
import { IconArrowUpRight, IconDoc, IconUsers, IconMessage, IconArrowRight } from "../../components/icons";
import { StarButton } from "./parts";
import { markRead } from "../../lib/local-state";

export function OpportunityCard({ item, index }: { item: FeedItemSummary; index: number }) {
  const o = item.opportunity;
  const ready = o?.status === "ready";
  const pending = !o || o.status === "pending";
  return (
    <article className={`opportunity-card ${ready ? "is-ready" : "is-pending"}`} data-item-id={item.id} data-opportunity-state={o?.status ?? "pending"}>
      <header className="opportunity-card-top">
        <span className="opportunity-number">{String(index).padStart(2, "0")}</span>
        <span className="min-w-0 truncate">{item.source.name.replace(/^Reddit · /, "")}</span>
        <StarButton item={item} size={32} showLabel className="ml-auto" />
      </header>
      <div className="opportunity-card-body">
        <p className="opportunity-kicker"><IconDoc size={14} />{ready ? "可以尝试的小工具 · 待验证" : pending ? "原始线索 · 等待整理" : "已阅读 · 暂无明确工具切口"}</p>
        <h3 className="opportunity-title">
          <Link to={`/items/${item.id}${ready ? "#research" : ""}`} onClick={() => markRead(item.id)}>{ready ? o.idea : item.title}</Link>
        </h3>
        {ready ? (
          <>
            <dl className="opportunity-facts">
              <div><dt><IconUsers size={15} />谁会用</dt><dd>{o.user ?? "需要进一步确认目标用户"}</dd></div>
              <div><dt><IconMessage size={15} />卡在哪</dt><dd>{o.problem ?? "具体障碍还需向用户确认"}</dd></div>
            </dl>
            <div className="opportunity-payment">
              <span>{o.payment ? PAYMENT_KINDS[o.paymentKind] : "付费这件事，还要验证"}</span>
              <p>{o.payment ?? "原帖没有给出购买预算，先确认对方愿意为哪一步付钱。"}</p>
            </div>
            <div className="opportunity-next"><span>第一步</span><p>{o.nextStep ?? "找一位有类似问题的人，确认现在的做法，再用一份真实样本验证。"}</p></div>
          </>
        ) : (
          <>
            <p className="opportunity-raw-summary">{item.summary ?? "这条资料暂时只有标题，具体情况需要查看原帖。"}</p>
            <p className="opportunity-pending-note">{pending ? "小工具切口、中文说明和付款证据尚未生成。" : "现有材料还不足以形成一个值得验证的产品点子。"}</p>
          </>
        )}
      </div>
      <footer className="opportunity-card-footer">
        <span className="opportunity-evidence">{item.score === null ? "待评估" : <>研究参考 <strong>{item.score}</strong><span>/100</span></>}{ready && <span className="ml-2">· {o.evidenceCount}/5 维有依据</span>}</span>
        <Link to={`/items/${item.id}${ready ? "#research" : ""}`} onClick={() => markRead(item.id)} className="opportunity-open">{ready ? "看机会详情" : "查看线索"}{ready ? <IconArrowUpRight size={17} /> : <IconArrowRight size={17} />}</Link>
      </footer>
    </article>
  );
}
