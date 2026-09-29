-- A flat list ordered by demand value; null denotes unscored, never a low-value judgement.
CREATE INDEX IF NOT EXISTS publications_demand_rank_idx
ON publications (score DESC NULLS LAST, timeline_at DESC, article_id DESC)
WHERE visibility = 'public' AND eligible;
