const assert = require("node:assert/strict");
const test = require("node:test");
const { FallbackJobRepository, MemoryJobRepository, RedisJobRepository } = require("../src/storage/jobRepository");
const { createJobRepository } = require("../src/storage");

function createFakeRedisClient() {
  const values = new Map();
  const calls = [];
  return {
    isReady: true,
    isOpen: true,
    calls,
    connect: async () => {},
    set: async (key, value, options) => {
      calls.push({ command: "set", key, options });
      values.set(key, value);
    },
    get: async (key) => values.get(key) || null,
    ping: async () => "PONG",
    quit: async () => {},
    scanIterator: async function* () {
      yield* values.keys();
    },
    del: async (keys) => keys.forEach((key) => values.delete(key)),
  };
}

test("Redis repository serializes jobs and applies TTL", async () => {
  const client = createFakeRedisClient();
  const repository = new RedisJobRepository({ client, ttlSeconds: 3600, keyPrefix: "test:job:" });
  const job = { id: "abc", status: "queued", nested: { progress: 0 } };

  await repository.save(job);
  const restored = await repository.get("abc");

  assert.deepEqual(restored, job);
  assert.deepEqual(client.calls[0], {
    command: "set",
    key: "test:job:abc",
    options: { EX: 3600 },
  });
  assert.deepEqual(await repository.health(), {
    provider: "redis",
    status: "ready",
    persistent: true,
    ttlSeconds: 3600,
  });
});

test("fallback repository keeps jobs available when Redis fails", async () => {
  const failingRedis = {
    save: async () => { throw new Error("Redis offline"); },
    get: async () => { throw new Error("Redis offline"); },
    clear: async () => { throw new Error("Redis offline"); },
    health: async () => { throw new Error("Redis offline"); },
    close: async () => {},
  };
  const repository = new FallbackJobRepository(failingRedis, new MemoryJobRepository());
  const job = { id: "fallback-job", status: "queued" };

  await repository.save(job);

  assert.deepEqual(await repository.get(job.id), job);
  assert.deepEqual(await repository.health(), {
    provider: "memory",
    status: "degraded",
    persistent: false,
    fallbackAvailable: true,
    reason: "Redis unavailable; using in-memory storage",
  });
});

test("memory repository returns copies instead of mutable stored references", async () => {
  const repository = new MemoryJobRepository();
  await repository.save({ id: "copy-test", status: "queued" });
  const first = await repository.get("copy-test");
  first.status = "mutated";

  assert.equal((await repository.get("copy-test")).status, "queued");
});

test("required Redis mode rejects a missing URL", () => {
  assert.throws(
    () => createJobRepository({ REDIS_REQUIRED: "true" }),
    /REDIS_URL is required/,
  );
});
