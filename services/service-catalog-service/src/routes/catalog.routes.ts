import { Router } from "express";
import {
  createApiKey,
  createService,
  deleteService,
  getService,
  listApiKeys,
  listServices,
  revokeApiKey,
  updateService
} from "../controllers/catalog.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireOrgMembership } from "../middleware/requireOrgMembership";
import { validateBody } from "../middleware/validate";
import { createApiKeySchema, createServiceSchema, updateServiceSchema } from "../validators/catalog.schemas";

export const catalogRouter = Router({ mergeParams: true });
catalogRouter.use(requireAuth);

catalogRouter.post("/", requireOrgMembership(["OWNER", "ADMIN", "ENGINEER"]), validateBody(createServiceSchema), createService);
catalogRouter.get("/", requireOrgMembership(), listServices);
catalogRouter.get("/:serviceId", requireOrgMembership(), getService);
catalogRouter.patch("/:serviceId", requireOrgMembership(["OWNER", "ADMIN", "ENGINEER"]), validateBody(updateServiceSchema), updateService);
catalogRouter.delete("/:serviceId", requireOrgMembership(["OWNER", "ADMIN"]), deleteService);
catalogRouter.post("/:serviceId/api-keys", requireOrgMembership(["OWNER", "ADMIN", "ENGINEER"]), validateBody(createApiKeySchema), createApiKey);
catalogRouter.get("/:serviceId/api-keys", requireOrgMembership(["OWNER", "ADMIN", "ENGINEER"]), listApiKeys);
catalogRouter.delete("/:serviceId/api-keys/:keyId", requireOrgMembership(["OWNER", "ADMIN"]), revokeApiKey);

