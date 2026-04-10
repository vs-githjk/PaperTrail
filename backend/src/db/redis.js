const Redis = require("ioredis");
const config = require("../config");

const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  connectTimeout: 1000,
  retryStrategy: null
});

module.exports = { redisClient };
