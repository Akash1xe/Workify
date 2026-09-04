import { z } from "zod";
import { attributes, batch, timestamp } from "./common";

export const eventRecordSchema = z.object({
  timestamp,
  name: z.string().trim().min(1).max(255),
  severity: z.enum(["INFO", "WARN", "ERROR"]),
  message: z.string().trim().min(1).max(32 * 1024).optional(),
  attributes
}).strict();

export const eventsSchema = batch(eventRecordSchema);
