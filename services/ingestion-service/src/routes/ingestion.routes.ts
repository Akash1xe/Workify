import { Router } from "express";
import { ingest } from "../controllers/ingestion.controller";
import { requireServiceApiKey } from "../middleware/requireServiceApiKey";
import { serviceRateLimit } from "../middleware/serviceRateLimit";
import { validateBody } from "../middleware/validate";
import { eventsSchema } from "../schemas/event.schema";
import { logsSchema } from "../schemas/log.schema";
import { metricsSchema } from "../schemas/metric.schema";
import { RedisServiceRateLimiter } from "../services/rateLimit.service";

export const rateLimiter = new RedisServiceRateLimiter();
export const ingestionRouter = Router();
ingestionRouter.use(requireServiceApiKey, serviceRateLimit(rateLimiter));
ingestionRouter.post("/logs", validateBody(logsSchema), ingest("LOG"));
ingestionRouter.post("/metrics", validateBody(metricsSchema), ingest("METRIC"));
ingestionRouter.post("/events", validateBody(eventsSchema), ingest("EVENT"));
