import { z } from "zod";
import { attributes, batch, timestamp } from "./common";

export const metricRecordSchema = z.object({
  timestamp,
  name: z.string().trim().min(1).max(255),
  value: z.number().finite(),
  type: z.enum(["GAUGE", "COUNTER", "HISTOGRAM"]),
  unit: z.string().trim().min(1).max(100).optional(),
  attributes
}).strict();

export const metricsSchema = batch(metricRecordSchema);
