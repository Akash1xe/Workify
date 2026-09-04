import { z } from "zod";

export const timestamp = z.string().datetime({ offset: true }).optional();
export const attributes = z.record(z.string(), z.unknown()).refine(
  (value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= 16 * 1024,
  "attributes must not exceed 16 KB"
).optional();

export const batch = <T extends z.ZodType>(record: T) => z.union([
  z.object({ records: z.array(record).min(1).max(1000) }).strict(),
  record
]).transform((value) => "records" in (value as object) ? value as { records: z.infer<T>[] } : { records: [value as z.infer<T>] });
