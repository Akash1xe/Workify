import { createServer } from "node:http";
import { Server } from "socket.io";
import { createApp } from "./app";
import { env } from "./config/env";
import { configureRedis } from "./config/redis";
import { socketAuth } from "./middleware/socketAuth";
import { registerSocketHandlers } from "./socket/handlers";

let redisState = () => "initializing";
const httpServer = createServer(createApp(() => redisState()));
const io = new Server(httpServer, {
  path: "/socket.io",
  cors: { origin: env.corsOrigins, credentials: true }
});

io.use(socketAuth);
registerSocketHandlers(io);
const redis = configureRedis(io);
redisState = redis.redisState;

httpServer.listen(env.PORT, () => console.log(`realtime-service listening on port ${env.PORT}`));

const shutdown = async () => {
  io.close();
  await redis.close();
  httpServer.close(() => process.exit(0));
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
