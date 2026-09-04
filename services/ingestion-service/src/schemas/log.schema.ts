import { z } from "zod";
import { attributes, batch, timestamp } from "./common";

export const logRecordSchema = z.object({
  timestamp,
  level: z.enum(["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"]),
  message: z.string().trim().min(1).max(32 * 1024),
  traceId: z.string().trim().min(1).max(128).optional(),
  spanId: z.string().trim().min(1).max(128).optional(),
  requestId: z.string().trim().min(1).max(256).optional(),
  attributes
}).strict();

export const logsSchema = batch(logRecordSchema);
