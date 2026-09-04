import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";

export const createApp = (redisState: () => string) => {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Origin is not allowed"));
    },
    credentials: true
  }));
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "realtime-service", redis: redisState() }));
  app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
  return app;
};
