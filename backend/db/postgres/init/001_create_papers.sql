CREATE TABLE IF NOT EXISTS papers (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  year INT,
  doi TEXT UNIQUE,
  abstract TEXT,
  authors JSONB DEFAULT '[]'::jsonb,
  influence_score DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
