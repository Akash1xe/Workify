import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  AUTH_SERVICE_URL: z.url().default("http://localhost:4001"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  RATE_LIMIT_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false")
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

export const env = { ...parsed.data, corsOrigins, trustProxy: parsed.data.TRUST_PROXY === "true" };

