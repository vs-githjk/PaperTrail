const app = require("./app");
const config = require("./config");
const { pgPool } = require("./db/postgres");
const { neo4jDriver } = require("./db/neo4j");
const { redisClient } = require("./db/redis");

async function ensurePostgresSchema() {
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgPool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS name TEXT;
  `);

  await pgPool.query(`
    UPDATE users
    SET name = COALESCE(NULLIF(name, ''), split_part(email, '@', 1), 'User')
    WHERE name IS NULL OR name = '';
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS user_searches (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      query TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgPool.query(`
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
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS research_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      query TEXT,
      selected_paper JSONB NOT NULL,
      guide JSONB DEFAULT '{}'::jsonb,
      graph_stats JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pgPool.query(`
    ALTER TABLE papers
      ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS source TEXT,
      ADD COLUMN IF NOT EXISTS abstract TEXT,
      ADD COLUMN IF NOT EXISTS authors JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS influence_score DOUBLE PRECISION DEFAULT 0;
  `);

  await pgPool.query(`
    ALTER TABLE research_sessions
      ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON DELETE CASCADE;
  `);
}

async function bootstrap() {
  try {
    await ensurePostgresSchema();
  } catch (error) {
    console.warn("Postgres unavailable; running with external-search fallback only.");
  }

  try {
    await neo4jDriver.getServerInfo();
  } catch (error) {
    console.warn("Neo4j unavailable; ancestor graph endpoints may fail.");
  }

  try {
    await redisClient.ping();
  } catch (error) {
    console.warn("Redis unavailable; caching disabled.");
  }

  app.listen(config.port, () => {
    console.log(`API running on http://localhost:${config.port}`);
  });
}

bootstrap().catch(async (error) => {
  console.error("Failed to start server:", error.message);
  await Promise.allSettled([pgPool.end(), neo4jDriver.close(), redisClient.quit()]);
  process.exit(1);
});
