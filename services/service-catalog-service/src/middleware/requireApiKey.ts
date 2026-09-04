import { RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { CatalogService } from "../services/catalog.service";
export { isApiKeyUsable } from "../utils/apiKeyUsability";

const catalog = new CatalogService();

export const requireApiKey: RequestHandler = async (req, _res, next) => {
  const rawKey = req.header("x-api-key");
  if (!rawKey) return next(new AppError(401, "API_KEY_REQUIRED", "API key is required"));

  try {
    const identity = await catalog.verifyApiKey(rawKey);
    req.apiKeyIdentity = { apiKeyId: identity.apiKey.id, serviceId: identity.service.id };
    next();
  } catch (error) {
    next(error);
  }
};
