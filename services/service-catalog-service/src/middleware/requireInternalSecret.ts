import { timingSafeEqual } from "node:crypto";
import { RequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

const equal = (value: string, expected: string) => {
  const left = Buffer.from(value);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const requireInternalSecret: RequestHandler = (req, _res, next) => {
  const secret = req.header("x-internal-service-secret");
  if (!secret || !equal(secret, env.INTERNAL_SERVICE_SECRET)) {
    return next(new AppError(401, "INVALID_INTERNAL_SECRET", "Internal service authentication failed"));
  }
  next();
};
