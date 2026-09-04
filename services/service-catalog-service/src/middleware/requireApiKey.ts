import { RequestHandler } from "express";
import { AppError } from "../errors/AppError";
import { ApiKeyRepository } from "../repositories/apiKey.repository";
import { hashApiKey } from "../utils/apiKey";

const apiKeys = new ApiKeyRepository();

export const isApiKeyUsable = (apiKey: { revoked: boolean; expiresAt: Date | null }, now = new Date()): boolean =>
  !apiKey.revoked && (!apiKey.expiresAt || apiKey.expiresAt > now);

export const requireApiKey: RequestHandler = async (req, _res, next) => {
  const rawKey = req.header("x-api-key");
  if (!rawKey) return next(new AppError(401, "API_KEY_REQUIRED", "API key is required"));

  try {
    const apiKey = await apiKeys.findByHash(hashApiKey(rawKey));
    if (!apiKey || !isApiKeyUsable(apiKey)) {
      throw new AppError(401, "INVALID_API_KEY", "API key is invalid, revoked, or expired");
    }

    await apiKeys.touch(apiKey.id);
    req.apiKeyIdentity = { apiKeyId: apiKey.id, serviceId: apiKey.serviceId };
    next();
  } catch (error) {
    next(error);
  }
};
