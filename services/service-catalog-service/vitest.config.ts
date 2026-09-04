import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/sentinel_catalog_test",
      JWT_ACCESS_SECRET: "test-access-secret-12345678901234567890",
      ORGANIZATION_SERVICE_URL: "http://localhost:4002",
      INTERNAL_SERVICE_SECRET: "test-internal-secret-12345678901234567890"
    }
  }
});
