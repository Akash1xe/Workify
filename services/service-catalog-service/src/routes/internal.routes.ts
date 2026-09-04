import { Router } from "express";
import { verifyApiKey } from "../controllers/catalog.controller";
import { requireInternalSecret } from "../middleware/requireInternalSecret";
import { validateBody } from "../middleware/validate";
import { verifyApiKeySchema } from "../validators/catalog.schemas";

export const internalRouter = Router();
internalRouter.use(requireInternalSecret);
internalRouter.post("/api-keys/verify", validateBody(verifyApiKeySchema), verifyApiKey);
