import { RequestHandler } from "express";
import { ServiceRateLimiter } from "../services/rateLimit.service";
import { AppError } from "../utils/AppError";

export const serviceRateLimit = (limiter: ServiceRateLimiter): RequestHandler => async (req, _res, next) => {
  if (!req.serviceIdentity) return next(new AppError(401, "INVALID_API_KEY", "Service authentication required"));
  try {
    const result = await limiter.check(req.serviceIdentity.service.id);
    if (!result.allowed) return next(new AppError(429, "RATE_LIMITED", "Service ingestion rate limit exceeded"));
    next();
  } catch (error) {
    console.warn("Telemetry rate limiter failed open", { serviceId: req.serviceIdentity.service.id });
    next();
  }
};
