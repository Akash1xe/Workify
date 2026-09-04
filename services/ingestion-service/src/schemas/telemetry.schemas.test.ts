import { describe, expect, it } from "vitest";
import { eventsSchema } from "./event.schema";
import { logsSchema } from "./log.schema";
import { metricsSchema } from "./metric.schema";

describe("telemetry schemas", () => {
  it("accepts and normalizes a single log", () => {
    expect(logsSchema.parse({ level: "ERROR", message: "failed" }).records).toHaveLength(1);
  });
  it("accepts a log batch", () => {
    expect(logsSchema.parse({ records: [{ level: "INFO", message: "ok" }] }).records).toHaveLength(1);
  });
  it("rejects a batch over 1000 records", () => {
    expect(logsSchema.safeParse({ records: Array.from({ length: 1001 }, () => ({ level: "INFO", message: "ok" })) }).success).toBe(false);
  });
  it("rejects the whole batch when one log is invalid", () => {
    expect(logsSchema.safeParse({ records: [{ level: "INFO", message: "ok" }, { level: "INFO", message: "" }] }).success).toBe(false);
  });
  it("rejects client-supplied tenant identity", () => {
    expect(logsSchema.safeParse({ level: "INFO", message: "ok", organizationId: "attacker-org" }).success).toBe(false);
  });
  it("rejects attributes larger than 16KB", () => {
    expect(logsSchema.safeParse({ level: "INFO", message: "ok", attributes: { huge: "x".repeat(17_000) } }).success).toBe(false);
  });
  it("accepts a finite metric", () => {
    expect(metricsSchema.safeParse({ name: "error_rate", value: 0.1, type: "GAUGE" }).success).toBe(true);
  });
  it("rejects a non-finite metric", () => {
    expect(metricsSchema.safeParse({ name: "error_rate", value: Infinity, type: "GAUGE" }).success).toBe(false);
  });
  it("accepts a generic event", () => {
    expect(eventsSchema.safeParse({ name: "deployment.completed", severity: "INFO" }).success).toBe(true);
  });
  it("rejects malformed timestamps", () => {
    expect(eventsSchema.safeParse({ name: "deployment.completed", severity: "INFO", timestamp: "yesterday" }).success).toBe(false);
  });
});
