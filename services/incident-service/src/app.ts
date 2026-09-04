import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { incidentRouter } from "./routes/incident.routes";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Origin is not allowed"));
  },
  credentials: true
}));
app.use((req, res, next) => {
  const requestId = req.header("x-request-id") || randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok", service: "incident-service" }));
app.use("/organizations/:organizationId/incidents", incidentRouter);
app.use((_req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } }));
app.use(errorHandler);
