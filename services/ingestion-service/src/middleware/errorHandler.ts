import { ErrorRequestHandler } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({ error: { code: error.code, message: error.message }, requestId: req.header("x-request-id") });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" }, requestId: req.header("x-request-id") });
    return;
  }
  console.error("Unhandled ingestion error", { requestId: req.header("x-request-id"), message: error instanceof Error ? error.message : "Unknown error" });
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    ...(env.NODE_ENV !== "production" && error instanceof Error ? { details: error.message } : {})
  });
};
