class MemoryJobRepository {
  constructor() {
    this.jobs = new Map();
  }

  async save(job) {
    this.jobs.set(job.id, structuredClone(job));
    return structuredClone(job);
  }

  async get(id) {
    const job = this.jobs.get(id);
    return job ? structuredClone(job) : null;
  }

  async clear() {
    this.jobs.clear();
  }

  async health() {
    return { provider: "memory", status: "ready", persistent: false };
  }

  async close() {}
}

class RedisJobRepository {
  constructor({ client, ttlSeconds = 86400, keyPrefix = "research:job:" }) {
    this.client = client;
    this.ttlSeconds = ttlSeconds;
    this.keyPrefix = keyPrefix;
    this.connectPromise = null;
  }

  async connect() {
    if (this.client.isReady) return;
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().catch((error) => {
        this.connectPromise = null;
        throw error;
      });
    }
    await this.connectPromise;
  }

  async save(job) {
    await this.connect();
    await this.client.set(`${this.keyPrefix}${job.id}`, JSON.stringify(job), { EX: this.ttlSeconds });
    return job;
  }

  async get(id) {
    await this.connect();
    const value = await this.client.get(`${this.keyPrefix}${id}`);
    return value ? JSON.parse(value) : null;
  }

  async clear() {
    await this.connect();
    const keys = [];
    for await (const key of this.client.scanIterator({ MATCH: `${this.keyPrefix}*`, COUNT: 100 })) {
      keys.push(key);
    }
    if (keys.length) await this.client.del(keys);
  }

  async health() {
    await this.connect();
    await this.client.ping();
    return { provider: "redis", status: "ready", persistent: true, ttlSeconds: this.ttlSeconds };
  }

  async close() {
    if (this.client.isOpen) await this.client.quit();
  }
}

class FallbackJobRepository {
  constructor(primary, fallback, { required = false } = {}) {
    this.primary = primary;
    this.fallback = fallback;
    this.required = required;
    this.lastError = null;
  }

  async save(job) {
    await this.fallback.save(job);
    try {
      const result = await this.primary.save(job);
      this.lastError = null;
      return result;
    } catch (error) {
      this.handleError(error);
      return job;
    }
  }

  async get(id) {
    try {
      const job = await this.primary.get(id);
      this.lastError = null;
      if (job) await this.fallback.save(job);
      return job || this.fallback.get(id);
    } catch (error) {
      this.handleError(error);
      return this.fallback.get(id);
    }
  }

  async clear() {
    await this.fallback.clear();
    try {
      await this.primary.clear();
      this.lastError = null;
    } catch (error) {
      this.handleError(error);
    }
  }

  async health() {
    try {
      const status = await this.primary.health();
      this.lastError = null;
      return { ...status, fallbackAvailable: true };
    } catch (error) {
      if (this.required) throw error;
      this.lastError = error.message;
      return {
        provider: "memory",
        status: "degraded",
        persistent: false,
        fallbackAvailable: true,
        reason: "Redis unavailable; using in-memory storage",
      };
    }
  }

  async close() {
    await Promise.allSettled([this.primary.close(), this.fallback.close()]);
  }

  handleError(error) {
    this.lastError = error.message;
    if (this.required) throw error;
  }
}

module.exports = { FallbackJobRepository, MemoryJobRepository, RedisJobRepository };
