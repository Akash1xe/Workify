import { z } from "zod";

const optionalText = z.string().trim().max(255).optional();

export const createServiceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2_000).optional(),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION"]).optional(),
  healthCheckUrl: z.union([z.url().max(2_048), z.literal("")]).optional(),
  githubRepository: z.string().trim().max(255).optional(),
  team: optionalText,
  language: optionalText,
  framework: optionalText
});

export const updateServiceSchema = createServiceSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field must be provided" }
);

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(365).optional()
});

export const heartbeatSchema = z.object({
  status: z.enum(["HEALTHY", "DEGRADED", "DOWN"]),
  version: z.string().trim().min(1).max(100).optional()
});
