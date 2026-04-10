const app = require("./app");
const config = require("./config");
const { pgPool } = require("./db/postgres");
const { neo4jDriver } = require("./db/neo4j");
const { redisClient } = require("./db/redis");

async function ensurePostgresSchema() {
  await pgPool.query(`
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
  `);

  await pgPool.query(`
    ALTER TABLE papers
      ADD COLUMN IF NOT EXISTS abstract TEXT,
      ADD COLUMN IF NOT EXISTS authors JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS influence_score DOUBLE PRECISION DEFAULT 0;
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
