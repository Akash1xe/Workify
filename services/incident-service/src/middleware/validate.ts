import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { AppError } from "../errors/AppError";

const validate = (schema: ZodType, value: unknown) => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", result.error.issues.map((issue) => issue.message).join(", "));
  }
  return result.data;
};

export const validateBody = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
  try { req.body = validate(schema, req.body); next(); } catch (error) { next(error); }
};

export const validateParams = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
  try { req.params = validate(schema, req.params) as typeof req.params; next(); } catch (error) { next(error); }
};

export const validateQuery = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
  try { req.query = validate(schema, req.query) as typeof req.query; next(); } catch (error) { next(error); }
};
