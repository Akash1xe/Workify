import { Environment, Service, ServiceStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { serializeService, STALE_HEARTBEAT_MS } from "./serviceSerializer";

const service = (lastHeartbeatAt: Date | null, status = ServiceStatus.HEALTHY): Service => ({
  id: "service-1",
  organizationId: "org-1",
  name: "payment-service",
  description: null,
  environment: Environment.PRODUCTION,
  healthCheckUrl: null,
  githubRepository: null,
  team: null,
  language: null,
  framework: null,
  ownerUserId: "user-1",
  status,
  lastHeartbeatAt,
  lastDeploymentVersion: null,
  createdAt: new Date(0),
  updatedAt: new Date(0)
});

describe("serializeService", () => {
  const now = new Date("2026-09-04T12:00:00.000Z");

  it("marks a missing heartbeat as stale and UNKNOWN", () => {
    expect(serializeService(service(null), now)).toMatchObject({ status: "UNKNOWN", isStale: true });
  });

  it("preserves a recent stored status", () => {
    const heartbeat = new Date(now.getTime() - 20_000);
    expect(serializeService(service(heartbeat, ServiceStatus.DEGRADED), now)).toMatchObject({ status: "DEGRADED", isStale: false });
  });

  it("changes a heartbeat older than 90 seconds to UNKNOWN", () => {
    const heartbeat = new Date(now.getTime() - STALE_HEARTBEAT_MS - 1);
    expect(serializeService(service(heartbeat), now)).toMatchObject({ status: "UNKNOWN", isStale: true });
  });
});

