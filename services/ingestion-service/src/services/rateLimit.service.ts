import Redis from "ioredis";
import { env } from "../config/env";

export interface RateLimitResult { allowed: boolean; count?: number }
export interface ServiceRateLimiter { check(serviceId: string): Promise<RateLimitResult> }

export class RedisServiceRateLimiter implements ServiceRateLimiter {
  private readonly redis = new Redis(env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 500,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5_000)
  });

  constructor() {
    this.redis.on("error", (error) => console.warn("Telemetry rate limiter Redis error", { message: error.message }));
  }

  async check(serviceId: string): Promise<RateLimitResult> {
    try {
      const key = `sentinel:ingest:rate:${serviceId}:${Math.floor(Date.now() / (env.SERVICE_RATE_WINDOW_SECONDS * 1000))}`;
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, env.SERVICE_RATE_WINDOW_SECONDS + 1);
      return { allowed: count <= env.SERVICE_RATE_LIMIT, count };
    } catch (error) {
      console.warn("Telemetry rate limiter failed open", { serviceId, message: error instanceof Error ? error.message : "Unknown error" });
      return { allowed: true };
    }
  }

  async close() { await this.redis.quit().catch(() => undefined); }
}
