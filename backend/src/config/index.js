require("dotenv").config();

function parseBoolean(value, fallback = false) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

const postgresConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const shouldUsePostgresSsl = parseBoolean(process.env.POSTGRES_SSL, false);
const allowedCorsOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const postgres = postgresConnectionString
  ? {
      connectionString: postgresConnectionString,
      connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS) || 1500,
      ssl: shouldUsePostgresSsl ? { rejectUnauthorized: false } : false
    }
  : {
      host: process.env.POSTGRES_HOST || "localhost",
      port: Number(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || "research_genealogy",
      user: process.env.POSTGRES_USER || "app_user",
      password: process.env.POSTGRES_PASSWORD || "app_password",
      connectionTimeoutMillis: Number(process.env.POSTGRES_CONNECT_TIMEOUT_MS) || 1500,
      ssl: shouldUsePostgresSsl ? { rejectUnauthorized: false } : false
    };

const config = {
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 4000,
  corsOrigins: allowedCorsOrigins,
  postgres,
  neo4j: {
    uri: process.env.NEO4J_URI || "bolt://localhost:7687",
    user: process.env.NEO4J_USER || "neo4j",
    password: process.env.NEO4J_PASSWORD || "neo4j_password"
  },
  redis: {
    url: process.env.REDIS_URL || "",
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379
  },
  auth: {
    sessionTtlHours: Number(process.env.AUTH_SESSION_TTL_HOURS) || 168
  }
};

module.exports = config;
