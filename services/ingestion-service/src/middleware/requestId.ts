import { randomUUID } from "node:crypto";
import { RequestHandler } from "express";

export const requestId: RequestHandler = (req, res, next) => {
  const id = req.header("x-request-id") || randomUUID();
  req.headers["x-request-id"] = id;
  res.setHeader("x-request-id", id);
  next();
};
