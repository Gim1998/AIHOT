/** Demand value is one uniform indicator, without selected tiers or color thresholds. */
export function ScoreLabel({ score, compact = false }: { score: number | null; compact?: boolean }) {
  if (score === null) return <span className="text-[11.5px] text-ink-4">暂无评分</span>;
  const value = Math.round(score);
  return <span title={`需求价值 ${value}/100；依据当前材料，不代表市场已验证`} aria-label={`需求价值 ${value} 分`}
    className="inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-bg-sunk px-2 text-ink-2 ring-1 ring-inset ring-line">
    {!compact && <span className="text-[11px] font-medium">需求价值</span>}
    <span className="mono text-[12.5px] font-bold tabular-nums">{value}<span className="font-normal text-ink-4">/100</span></span>
  </span>;
}
