CREATE TABLE IF NOT EXISTS papers (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  year INT,
  doi TEXT UNIQUE,
  external_id TEXT UNIQUE,
  source TEXT,
  abstract TEXT,
  authors JSONB DEFAULT '[]'::jsonb,
  influence_score DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS research_sessions (
  id BIGSERIAL PRIMARY KEY,
  query TEXT,
  selected_paper JSONB NOT NULL,
  guide JSONB DEFAULT '{}'::jsonb,
  graph_stats JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
