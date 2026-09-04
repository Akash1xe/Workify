import { Kafka, logLevel, Producer } from "kafkajs";
import { env } from "../config/env";
import { TelemetryEnvelope } from "../types/telemetry";
import { AppError } from "../utils/AppError";

export interface TelemetryPublisher {
  publish(topic: string, serviceId: string, envelopes: TelemetryEnvelope[]): Promise<void>;
}

export class KafkaTelemetryProducer implements TelemetryPublisher {
  private readonly producer: Producer;
  private connected = false;
  private connecting = false;
  private stopping = false;
  private retryTimer?: NodeJS.Timeout;

  constructor() {
    this.producer = new Kafka({ clientId: env.KAFKA_CLIENT_ID, brokers: env.kafkaBrokers, logLevel: logLevel.WARN }).producer({
      allowAutoTopicCreation: false,
      idempotent: true,
      maxInFlightRequests: 1
    });
    this.producer.on(this.producer.events.CONNECT, () => { this.connected = true; });
    this.producer.on(this.producer.events.DISCONNECT, () => { this.connected = false; });
  }

  start() { void this.connect(); }

  private async connect(): Promise<void> {
    if (this.stopping || this.connected || this.connecting) return;
    this.connecting = true;
    try {
      await this.producer.connect();
      this.connected = true;
      console.info("Kafka producer connected", { clientId: env.KAFKA_CLIENT_ID });
    } catch (error) {
      this.connected = false;
      console.error("Kafka producer connection failed", { message: error instanceof Error ? error.message : "Unknown error" });
      this.retryTimer = setTimeout(() => void this.connect(), env.KAFKA_RETRY_INTERVAL_MS);
    } finally {
      this.connecting = false;
    }
  }

  isReady() { return this.connected; }

  async publish(topic: string, serviceId: string, envelopes: TelemetryEnvelope[]): Promise<void> {
    if (!this.connected) throw new AppError(503, "TELEMETRY_PIPELINE_UNAVAILABLE", "Telemetry could not be accepted at this time");
    try {
      await this.producer.send({
        topic,
        acks: -1,
        messages: envelopes.map((envelope) => ({ key: serviceId, value: JSON.stringify(envelope) }))
      });
    } catch (error) {
      this.connected = false;
      void this.connect();
      throw new AppError(503, "TELEMETRY_PIPELINE_UNAVAILABLE", "Telemetry could not be accepted at this time");
    }
  }

  async stop() {
    this.stopping = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.producer.disconnect().catch(() => undefined);
    this.connected = false;
  }
}
