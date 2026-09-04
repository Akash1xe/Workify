import { z } from "zod";

const durationPattern = /^\d+[smhd]$/;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4001),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().regex(durationPattern).default("15m"),
  REFRESH_TOKEN_TTL: z.string().regex(durationPattern).default("7d"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:4000"),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false")
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

const corsOrigins = [...new Set(parsed.data.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean))];

if (parsed.data.NODE_ENV === "production" && corsOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must contain at least one origin in production");
}

export const env = {
  ...parsed.data,
  corsOrigins,
  cookieSecure: parsed.data.COOKIE_SECURE === "true"
};

