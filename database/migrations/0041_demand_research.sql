CREATE TABLE article_discussions (
  article_id text PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  comments jsonb NOT NULL DEFAULT '[]',
  content_hash text NOT NULL DEFAULT '',
  partial boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  checked_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX article_discussions_due_idx ON article_discussions(next_check_at);

-- Private administrator notes never join the public publication projection.
CREATE TABLE research_notes (
  id text PRIMARY KEY,
  article_id text UNIQUE REFERENCES articles(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'inbox',
  verdict text NOT NULL DEFAULT 'unrated',
  details jsonb NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_notes_updated_idx ON research_notes(updated_at DESC, id);
CREATE INDEX analyses_research_terms_idx ON analyses USING gin ((output->'demand'->'research'->'terms'));
