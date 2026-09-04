import { describe, expect, it } from "vitest";
import { createServiceSchema, heartbeatSchema, updateServiceSchema } from "./catalog.schemas";

describe("catalog validation", () => {
  it("accepts a valid service", () => {
    expect(createServiceSchema.safeParse({ name: "payment-service", healthCheckUrl: "https://api.example.com/health" }).success).toBe(true);
  });

  it("rejects an invalid health URL", () => {
    expect(createServiceSchema.safeParse({ name: "payment-service", healthCheckUrl: "not-a-url" }).success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(updateServiceSchema.safeParse({}).success).toBe(false);
  });

  it("rejects UNKNOWN as a reported heartbeat status", () => {
    expect(heartbeatSchema.safeParse({ status: "UNKNOWN" }).success).toBe(false);
  });
});

