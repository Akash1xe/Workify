import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { Server } from "socket.io";
import { broadcastRealtimeMessage } from "../events/broadcaster";
import { env } from "./env";

export const REALTIME_CHANNEL = "sentinel:realtime";

const redisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt: number) => Math.min(attempt * 250, 5_000)
};

export const configureRedis = (io: Server) => {
  const publisher = new Redis(env.REDIS_URL, redisOptions);
  const adapterSubscriber = publisher.duplicate();
  const eventSubscriber = publisher.duplicate();

  io.adapter(createAdapter(publisher, adapterSubscriber));

  for (const [name, client] of [
    ["publisher", publisher],
    ["adapter-subscriber", adapterSubscriber],
    ["event-subscriber", eventSubscriber]
  ] as const) {
    client.on("error", (error) => console.error("Realtime Redis error", { client: name, message: error.message }));
  }

  eventSubscriber.on("message", (channel, message) => {
    if (channel === REALTIME_CHANNEL) broadcastRealtimeMessage(io, message);
  });
  eventSubscriber.on("ready", () => {
    eventSubscriber.subscribe(REALTIME_CHANNEL).catch((error) => {
      console.error("Realtime Redis subscription failed", { message: error instanceof Error ? error.message : "Unknown error" });
    });
  });

  Promise.allSettled([publisher.connect(), adapterSubscriber.connect(), eventSubscriber.connect()]).then((results) => {
    if (results.some((result) => result.status === "rejected")) {
      console.warn("Realtime service started with degraded Redis connectivity");
    }
  });

  return {
    redisState: () => publisher.status,
    close: async () => {
      await Promise.allSettled([publisher.quit(), adapterSubscriber.quit(), eventSubscriber.quit()]);
    }
  };
};
