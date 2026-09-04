import { Prisma } from "@prisma/client";
import { ErrorRequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message }, requestId: req.header("x-request-id") });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ error: { code: "CONFLICT", message: "Resource already exists" }, requestId: req.header("x-request-id") });
    return;
  }

  console.error("Unhandled request error", {
    requestId: req.header("x-request-id"),
    message: error instanceof Error ? error.message : "Unknown error"
  });
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    ...(env.NODE_ENV !== "production" && error instanceof Error ? { details: error.message } : {})
  });
};
