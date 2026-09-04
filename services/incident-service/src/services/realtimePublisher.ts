import Redis from "ioredis";
import { env } from "../config/env";

export const REALTIME_CHANNEL = "sentinel:realtime";

export type IncidentRealtimeEvent = {
  room: `incident:${string}` | `org:${string}`;
  event:
    | "incident:created"
    | "incident:updated"
    | "incident:status-changed"
    | "incident:severity-changed"
    | "incident:assignee-changed"
    | "incident:comment-added"
    | "incident:comment-updated"
    | "incident:comment-deleted"
    | "incident:deleted";
  payload: Record<string, unknown>;
};

let redis: Redis | null = null;

const client = () => {
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: env.REALTIME_PUBLISH_TIMEOUT_MS,
      retryStrategy: (attempt) => Math.min(attempt * 250, 5_000)
    });
    redis.on("error", (error) => console.error("Realtime Redis publisher error", { message: error.message }));
  }
  return redis;
};

const timeout = () => new Promise<never>((_resolve, reject) => {
  setTimeout(() => reject(new Error("Realtime publish timed out")), env.REALTIME_PUBLISH_TIMEOUT_MS).unref();
});

export const publishIncidentEvent = async (event: IncidentRealtimeEvent): Promise<void> => {
  try {
    const publisher = client();
    if (publisher.status === "wait") await Promise.race([publisher.connect(), timeout()]);
    await Promise.race([publisher.publish(REALTIME_CHANNEL, JSON.stringify(event)), timeout()]);
  } catch (error) {
    console.warn("Realtime incident event publish failed", {
      event: event.event,
      room: event.room,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
};

export const closeRealtimePublisher = async () => {
  if (redis) await redis.quit().catch(() => undefined);
};
