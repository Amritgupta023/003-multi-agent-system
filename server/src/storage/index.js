const { createClient } = require("redis");
const { FallbackJobRepository, MemoryJobRepository, RedisJobRepository } = require("./jobRepository");

function createJobRepository(environment = process.env) {
  const memory = new MemoryJobRepository();
  if (!environment.REDIS_URL) {
    if (environment.REDIS_REQUIRED === "true") {
      throw new Error("REDIS_URL is required when REDIS_REQUIRED=true");
    }
    return memory;
  }

  const ttlSeconds = Number(environment.REDIS_JOB_TTL_SECONDS || 86400);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) {
    throw new Error("REDIS_JOB_TTL_SECONDS must be an integer of at least 60");
  }

  const client = createClient({
    url: environment.REDIS_URL,
    socket: {
      connectTimeout: Number(environment.REDIS_CONNECT_TIMEOUT_MS || 2000),
      reconnectStrategy: false,
    },
  });
  client.on("error", () => {});

  const redis = new RedisJobRepository({
    client,
    ttlSeconds,
    keyPrefix: environment.REDIS_KEY_PREFIX || "research:job:",
  });
  return new FallbackJobRepository(redis, memory, { required: environment.REDIS_REQUIRED === "true" });
}

let repository = createJobRepository();

function getJobRepository() {
  return repository;
}

function setJobRepository(nextRepository) {
  repository = nextRepository;
}

module.exports = { createJobRepository, getJobRepository, setJobRepository };
