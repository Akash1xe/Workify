import { Server } from "socket.io";
import { z } from "zod";
import { RealtimeEnvelope } from "../types/events";

const eventNames = [
  "incident:created",
  "incident:updated",
  "incident:status-changed",
  "incident:severity-changed",
  "incident:assignee-changed",
  "incident:comment-added",
  "incident:comment-updated",
  "incident:comment-deleted",
  "incident:deleted"
] as const;

const envelopeSchema = z.object({
  room: z.string().regex(/^(incident|org):[0-9a-f-]+$/i),
  event: z.enum(eventNames),
  payload: z.record(z.string(), z.unknown())
}).strict();

export const broadcastRealtimeMessage = (io: Server, rawMessage: string): boolean => {
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(rawMessage));
    if (!parsed.success) {
      console.warn("Rejected invalid realtime message", { issues: parsed.error.issues.length });
      return false;
    }
    const envelope = parsed.data as RealtimeEnvelope;
    io.to(envelope.room).emit(envelope.event, envelope.payload);
    return true;
  } catch {
    console.warn("Rejected malformed realtime message");
    return false;
  }
};
