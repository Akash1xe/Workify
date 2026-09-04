import cors from "cors";
import express from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { env } from "./config/env";
import { AppError } from "./errors/AppError";
import { errorHandler } from "./middleware/errorHandler";
import { catalogRouter } from "./routes/catalog.routes";
import { heartbeatRouter } from "./routes/heartbeat.routes";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    callback(new AppError(403, "ORIGIN_NOT_ALLOWED", "Origin is not allowed"));
  },
  credentials: true
}));
app.use((req, res, next) => {
  const requestId = req.header("x-request-id") || randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/v1", heartbeatRouter);
app.use("/organizations/:organizationId/services", catalogRouter);
app.use((_req, _res, next) => next(new AppError(404, "NOT_FOUND", "Route not found")));
app.use(errorHandler);

