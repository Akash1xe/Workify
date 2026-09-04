import { describe, expect, it, vi } from "vitest";
import { TOPICS } from "../kafka/topics";
import { TelemetryPublisher } from "../kafka/producer";
import { ServiceIdentity } from "../types/telemetry";
import { AppError } from "../utils/AppError";
import { IngestionService } from "./ingestion.service";

const identity: ServiceIdentity = {
  service: { id: "service-trusted", organizationId: "org-trusted", name: "payment-service", environment: "PRODUCTION" },
  apiKey: { id: "key-id", name: "production key" }
};

const setup = () => {
  const publish = vi.fn();
  return { publish, service: new IngestionService({ publish } as TelemetryPublisher) };
};

describe("IngestionService", () => {
  it.each([
    ["LOG", TOPICS.LOG, { level: "ERROR", message: "failed" }],
    ["METRIC", TOPICS.METRIC, { name: "errors", value: 1, type: "COUNTER" }],
    ["EVENT", TOPICS.EVENT, { name: "deploy", severity: "INFO" }]
  ] as const)("publishes %s to its versioned topic", async (type, topic, record) => {
    const { service, publish } = setup();
    await service.ingest(type, [record], identity, "request-1");
    expect(publish).toHaveBeenCalledWith(topic, "service-trusted", expect.any(Array));
  });

  it("uses trusted identity and serviceId as the partition key", async () => {
    const { service, publish } = setup();
    await service.ingest("LOG", [{ level: "INFO", message: "ok", organizationId: "attacker" }], identity, "request-1");
    const envelope = publish.mock.calls[0][2][0];
    expect(publish.mock.calls[0][1]).toBe("service-trusted");
    expect(envelope).toMatchObject({ organizationId: "org-trusted", serviceId: "service-trusted", serviceName: "payment-service" });
  });

  it("builds the complete versioned envelope", async () => {
    const { service, publish } = setup();
    await service.ingest("LOG", [{ timestamp: "2026-09-04T10:30:00.000Z", level: "INFO", message: "ok" }], identity, "request-1");
    expect(publish.mock.calls[0][2][0]).toMatchObject({
      eventId: expect.any(String), schemaVersion: 1, observedAt: "2026-09-04T10:30:00.000Z",
      ingestedAt: expect.any(String), metadata: { apiKeyId: "key-id", ingestionRequestId: "request-1" }
    });
  });

  it("never includes the raw API key in the envelope", async () => {
    const { service, publish } = setup();
    await service.ingest("EVENT", [{ name: "deploy", severity: "INFO" }], identity, "request-1");
    expect(JSON.stringify(publish.mock.calls[0][2])).not.toContain("snt_live_");
  });

  it("returns accepted count only after publish resolves", async () => {
    const { service } = setup();
    await expect(service.ingest("LOG", [{ level: "INFO", message: "ok" }], identity, "request-1"))
      .resolves.toEqual({ accepted: 1, requestId: "request-1" });
  });

  it("propagates Kafka unavailability instead of claiming acceptance", async () => {
    const publish = vi.fn().mockRejectedValue(new AppError(503, "TELEMETRY_PIPELINE_UNAVAILABLE", "unavailable"));
    const service = new IngestionService({ publish } as TelemetryPublisher);
    await expect(service.ingest("LOG", [{ level: "INFO", message: "ok" }], identity, "request-1"))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});
