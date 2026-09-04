import { z } from "zod";
import { Server, Socket } from "socket.io";
import {
  AuthorizationError,
  verifyIncidentOwnership,
  verifyOrganizationMembership
} from "../clients/authorization.client";
import { IncidentJoinPayload, IncidentLeavePayload, SocketAck } from "../types/events";

const joinSchema = z.object({ organizationId: z.uuid(), incidentId: z.uuid() }).strict();
const leaveSchema = z.object({ incidentId: z.uuid() }).strict();

export type SocketDependencies = {
  verifyMembership: typeof verifyOrganizationMembership;
  verifyIncident: typeof verifyIncidentOwnership;
};

const ackError = (ack: ((response: SocketAck) => void) | undefined, code: string, message: string) => {
  ack?.({ ok: false, error: { code, message } });
};

export const registerSocketHandlers = (
  io: Server,
  dependencies: SocketDependencies = {
    verifyMembership: verifyOrganizationMembership,
    verifyIncident: verifyIncidentOwnership
  }
) => {
  io.on("connection", (socket: Socket) => {
    console.info("Socket connected", { socketId: socket.id, userId: socket.data.user.id });

    socket.on("incident:join", async (payload: IncidentJoinPayload, ack?: (response: SocketAck) => void) => {
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return ackError(ack, "VALIDATION_ERROR", "organizationId and incidentId must be valid UUIDs");

      const { organizationId, incidentId } = parsed.data;
      try {
        await dependencies.verifyMembership(organizationId, socket.data.authorization);
        await dependencies.verifyIncident(organizationId, incidentId, socket.data.authorization);
        await socket.join([`org:${organizationId}`, `incident:${incidentId}`]);
        console.info("Incident room joined", { socketId: socket.id, userId: socket.data.user.id, organizationId, incidentId });
        ack?.({ ok: true, incidentId });
      } catch (error) {
        const code = error instanceof AuthorizationError ? error.code : "AUTHORIZATION_FAILED";
        const message = error instanceof AuthorizationError ? error.message : "Incident room authorization failed";
        console.warn("Incident room denied", { socketId: socket.id, userId: socket.data.user.id, organizationId, incidentId, code });
        ackError(ack, code, message);
      }
    });

    socket.on("incident:leave", async (payload: IncidentLeavePayload, ack?: (response: SocketAck) => void) => {
      const parsed = leaveSchema.safeParse(payload);
      if (!parsed.success) return ackError(ack, "VALIDATION_ERROR", "incidentId must be a valid UUID");
      await socket.leave(`incident:${parsed.data.incidentId}`);
      console.info("Incident room left", { socketId: socket.id, userId: socket.data.user.id, incidentId: parsed.data.incidentId });
      ack?.({ ok: true, incidentId: parsed.data.incidentId });
    });

    socket.on("disconnect", (reason) => {
      console.info("Socket disconnected", { socketId: socket.id, userId: socket.data.user.id, reason });
    });
  });
};
