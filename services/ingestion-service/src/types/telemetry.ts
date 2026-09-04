export type TelemetryType = "LOG" | "METRIC" | "EVENT";
export type ServiceIdentity = {
  service: { id: string; organizationId: string; name: string; environment: string };
  apiKey: { id: string; name: string };
};

export interface TelemetryEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;
  schemaVersion: 1;
  telemetryType: TelemetryType;
  organizationId: string;
  serviceId: string;
  serviceName: string;
  environment: string;
  observedAt: string;
  ingestedAt: string;
  data: T;
  metadata: { apiKeyId: string; ingestionRequestId: string };
}
