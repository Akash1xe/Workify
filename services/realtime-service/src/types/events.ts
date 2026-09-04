export type IncidentStatus = "TRIGGERED" | "ACKNOWLEDGED" | "INVESTIGATING" | "MITIGATING" | "RESOLVED";
export type IncidentSeverity = "SEV1" | "SEV2" | "SEV3" | "SEV4";

export interface IncidentJoinPayload { organizationId: string; incidentId: string }
export interface IncidentLeavePayload { incidentId: string }
export interface SocketAck {
  ok: boolean;
  incidentId?: string;
  error?: { code: string; message: string };
}

export type RealtimeEventName =
  | "incident:created"
  | "incident:updated"
  | "incident:status-changed"
  | "incident:severity-changed"
  | "incident:assignee-changed"
  | "incident:comment-added"
  | "incident:comment-updated"
  | "incident:comment-deleted"
  | "incident:deleted";

export interface RealtimeEnvelope {
  room: `incident:${string}` | `org:${string}`;
  event: RealtimeEventName;
  payload: Record<string, unknown>;
}

export interface IncidentStatusChangedPayload {
  incidentId: string;
  organizationId: string;
  from: IncidentStatus;
  to: IncidentStatus;
  actorUserId: string | null;
  updatedAt: string;
}
