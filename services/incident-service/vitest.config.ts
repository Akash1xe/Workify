import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      JWT_ACCESS_SECRET: "test-access-secret-with-at-least-32-characters",
      ORGANIZATION_SERVICE_URL: "http://localhost:4002",
      CATALOG_SERVICE_URL: "http://localhost:4003"
    }
  }
});
