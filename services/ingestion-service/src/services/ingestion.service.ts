import { randomUUID } from "node:crypto";
import { TOPICS } from "../kafka/topics";
import { TelemetryPublisher } from "../kafka/producer";
import { ServiceIdentity, TelemetryEnvelope, TelemetryType } from "../types/telemetry";

type InputRecord = Record<string, unknown> & { timestamp?: string };

export class IngestionService {
  constructor(private readonly publisher: TelemetryPublisher) {}

  async ingest(
    telemetryType: TelemetryType,
    records: InputRecord[],
    identity: ServiceIdentity,
    requestId: string
  ) {
    const ingestedAt = new Date().toISOString();
    const envelopes: TelemetryEnvelope[] = records.map((record) => {
      const { timestamp, ...data } = record;
      return {
        eventId: randomUUID(),
        schemaVersion: 1,
        telemetryType,
        organizationId: identity.service.organizationId,
        serviceId: identity.service.id,
        serviceName: identity.service.name,
        environment: identity.service.environment,
        observedAt: timestamp ?? ingestedAt,
        ingestedAt,
        data,
        metadata: { apiKeyId: identity.apiKey.id, ingestionRequestId: requestId }
      };
    });

    await this.publisher.publish(TOPICS[telemetryType], identity.service.id, envelopes);
    console.info("Telemetry accepted by Kafka", {
      requestId,
      organizationId: identity.service.organizationId,
      serviceId: identity.service.id,
      telemetryType,
      recordCount: records.length
    });
    return { accepted: records.length, requestId };
  }
}
