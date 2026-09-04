import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/sentinel_org_test",
      JWT_ACCESS_SECRET: "test-access-secret-12345678901234567890"
    }
  }
});

