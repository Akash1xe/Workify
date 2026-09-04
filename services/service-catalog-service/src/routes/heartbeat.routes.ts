import { Router } from "express";
import { heartbeat } from "../controllers/catalog.controller";
import { requireApiKey } from "../middleware/requireApiKey";
import { validateBody } from "../middleware/validate";
import { heartbeatSchema } from "../validators/catalog.schemas";

export const heartbeatRouter = Router();
heartbeatRouter.post("/heartbeat", requireApiKey, validateBody(heartbeatSchema), heartbeat);

