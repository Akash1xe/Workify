import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { kafkaProducer } from "./controllers/ingestion.controller";
import { errorHandler } from "./middleware/errorHandler";
import { requestId } from "./middleware/requestId";
import { ingestionRouter } from "./routes/ingestion.routes";
import { AppError } from "./utils/AppError";

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
app.use(requestId);
app.use(express.json({ limit: env.BODY_LIMIT }));
app.get("/health", (_req, res) => res.json({ status: "ok", service: "ingestion-service" }));
app.get("/ready", (_req, res) => {
  if (!kafkaProducer.isReady()) return res.status(503).json({ status: "not-ready", kafka: "disconnected" });
  res.json({ status: "ready", kafka: "connected" });
});
app.use("/v1", ingestionRouter);
app.use((_req, _res, next) => next(new AppError(404, "NOT_FOUND", "Route not found")));
app.use(errorHandler);
