import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      SERVICE_CATALOG_URL: "http://localhost:4003",
      INTERNAL_SERVICE_SECRET: "test-internal-secret-12345678901234567890",
      KAFKA_BROKERS: "localhost:9092",
      REDIS_URL: "redis://localhost:6379"
    }
  }
});
