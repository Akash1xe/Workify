import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { AppError } from "../errors/AppError";

export const validateBody = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(new AppError(400, "VALIDATION_ERROR", result.error.issues.map((issue) => issue.message).join(", ")));
  }
  req.body = result.data;
  next();
};

