import { RequestHandler } from "express";
import { verifyServiceApiKey } from "../clients/serviceCatalog.client";
import { AppError } from "../utils/AppError";

export const requireServiceApiKey: RequestHandler = async (req, _res, next) => {
  const apiKey = req.header("x-api-key");
  if (!apiKey) return next(new AppError(401, "INVALID_API_KEY", "API key is required"));
  try {
    req.serviceIdentity = await verifyServiceApiKey(apiKey);
    next();
  } catch (error) { next(error); }
};
