const Redis = require("ioredis");
const config = require("../config");

const baseRedisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
  retryStrategy: null
};

const redisClient = config.redis.url
  ? new Redis(config.redis.url, baseRedisOptions)
  : new Redis({
      host: config.redis.host,
      port: config.redis.port,
      ...baseRedisOptions
    });

let hasWarnedAboutRedis = false;

redisClient.on("error", () => {
  if (!hasWarnedAboutRedis) {
    hasWarnedAboutRedis = true;
    console.warn("Redis connection failed; cache operations will be skipped.");
  }
});

module.exports = { redisClient };
