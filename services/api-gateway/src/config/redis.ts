import Redis from "ioredis";
import { env } from "./env";

export const redis = new Redis(env.REDIS_URL, {
  connectTimeout: 1_000,
  commandTimeout: 1_000,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => Math.min(attempt * 250, 2_000)
});

redis.on("error", (error) => {
  console.error("Redis connection error; rate limiting will fail open", { message: error.message });
});

