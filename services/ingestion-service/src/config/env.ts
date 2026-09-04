import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4006),
  SERVICE_CATALOG_URL: z.url().default("http://localhost:4003"),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().min(100).max(10_000).default(3_000),
  KAFKA_BROKERS: z.string().min(1).default("localhost:29092"),
  KAFKA_CLIENT_ID: z.string().min(1).default("sentinel-ingestion-service"),
  KAFKA_RETRY_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(3_000),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  SERVICE_RATE_LIMIT: z.coerce.number().int().positive().default(100),
  SERVICE_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(1),
  BODY_LIMIT: z.string().default("2mb"),
  CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:4000")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = {
  ...parsed.data,
  kafkaBrokers: parsed.data.KAFKA_BROKERS.split(",").map((value) => value.trim()).filter(Boolean),
  corsOrigins: [...new Set(parsed.data.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean))]
};
