import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default("sentinelai-auth"),
  JWT_AUDIENCE: z.string().min(1).default("sentinelai-api"),
  INVITATION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:4000")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

const corsOrigins = [...new Set(parsed.data.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean))];
if (parsed.data.NODE_ENV === "production" && corsOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must contain at least one origin in production");
}

export const env = { ...parsed.data, corsOrigins };

