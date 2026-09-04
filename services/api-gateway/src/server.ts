import { app } from "./app";
import { env } from "./config/env";
import { redis } from "./config/redis";

const server = app.listen(env.PORT, () => {
  console.log(`api-gateway listening on port ${env.PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    redis.disconnect();
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

