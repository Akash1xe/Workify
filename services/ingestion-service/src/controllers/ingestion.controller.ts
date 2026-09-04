import { RequestHandler } from "express";
import { KafkaTelemetryProducer } from "../kafka/producer";
import { TelemetryType } from "../types/telemetry";
import { IngestionService } from "../services/ingestion.service";

export const kafkaProducer = new KafkaTelemetryProducer();
const ingestion = new IngestionService(kafkaProducer);

export const ingest = (type: TelemetryType): RequestHandler => async (req, res, next) => {
  try {
    const result = await ingestion.ingest(type, req.body.records, req.serviceIdentity!, req.header("x-request-id")!);
    res.status(202).json(result);
  } catch (error) { next(error); }
};
