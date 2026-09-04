import { RequestHandler } from "express";
import { ZodType } from "zod";
import { AppError } from "../utils/AppError";

export const validateBody = (schema: ZodType): RequestHandler => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return next(new AppError(400, "INVALID_REQUEST", result.error.issues.map((issue) => issue.message).join(", ")));
  req.body = result.data;
  next();
};
