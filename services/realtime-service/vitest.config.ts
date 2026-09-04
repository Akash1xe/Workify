import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      JWT_ACCESS_SECRET: "test-access-secret-with-at-least-32-characters",
      ORGANIZATION_SERVICE_URL: "http://localhost:4002",
      INCIDENT_SERVICE_URL: "http://localhost:4004",
      REDIS_URL: "redis://localhost:6379"
    }
  }
});
