import {
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  Prisma,
  TimelineEventType
} from "@prisma/client";
import { prisma } from "../config/database";

export type TimelineInput = {
  type: TimelineEventType;
  actorUserId?: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
};

export type IncidentFilters = {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  serviceId?: string;
  assignedToUserId?: string;
};

export class IncidentRepository {
  createWithTimeline(data: {
    organizationId: string;
    serviceId: string;
    title: string;
    description?: string;
    severity: IncidentSeverity;
    source: IncidentSource;
    createdByUserId: string;
  }, event: TimelineInput) {
    return prisma.$transaction(async (tx) => {
      const incident = await tx.incident.create({ data });
      await tx.incidentTimelineEvent.create({ data: { incidentId: incident.id, ...event } });
      return incident;
    });
  }

  findScoped(organizationId: string, id: string) {
    return prisma.incident.findFirst({ where: { id, organizationId } });
  }

  async list(organizationId: string, filters: IncidentFilters, page: number, limit: number) {
    const where: Prisma.IncidentWhereInput = { organizationId, ...filters };
    const [items, total] = await prisma.$transaction([
      prisma.incident.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
      prisma.incident.count({ where })
    ]);
    return { items, total };
  }

  async updateDetails(organizationId: string, id: string, data: Prisma.IncidentUpdateInput, events: TimelineInput[]) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.incident.updateMany({ where: { id, organizationId }, data });
      if (!result.count) return null;
      if (events.length) {
        await tx.incidentTimelineEvent.createMany({ data: events.map((event) => ({ incidentId: id, ...event })) });
      }
      return tx.incident.findUnique({ where: { id } });
    });
  }

  async changeStatus(
    organizationId: string,
    id: string,
    expectedStatus: IncidentStatus,
    data: Prisma.IncidentUpdateInput,
    event: TimelineInput
  ) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.incident.updateMany({ where: { id, organizationId, status: expectedStatus }, data });
      if (!result.count) return null;
      await tx.incidentTimelineEvent.create({ data: { incidentId: id, ...event } });
      return tx.incident.findUnique({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async changeSeverity(
    organizationId: string,
    id: string,
    expectedSeverity: IncidentSeverity,
    severity: IncidentSeverity,
    event: TimelineInput
  ) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.incident.updateMany({ where: { id, organizationId, severity: expectedSeverity }, data: { severity } });
      if (!result.count) return null;
      await tx.incidentTimelineEvent.create({ data: { incidentId: id, ...event } });
      return tx.incident.findUnique({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async changeAssignee(
    organizationId: string,
    id: string,
    expectedAssignee: string | null,
    assignedToUserId: string | null,
    event: TimelineInput
  ) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.incident.updateMany({
        where: { id, organizationId, assignedToUserId: expectedAssignee },
        data: { assignedToUserId }
      });
      if (!result.count) return null;
      await tx.incidentTimelineEvent.create({ data: { incidentId: id, ...event } });
      return tx.incident.findUnique({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listTimeline(organizationId: string, incidentId: string, page: number, limit: number) {
    const where: Prisma.IncidentTimelineEventWhereInput = { incidentId, incident: { organizationId } };
    const [items, total] = await prisma.$transaction([
      prisma.incidentTimelineEvent.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * limit, take: limit }),
      prisma.incidentTimelineEvent.count({ where })
    ]);
    return { items, total };
  }

  async delete(organizationId: string, id: string) {
    const result = await prisma.incident.deleteMany({ where: { id, organizationId } });
    return result.count > 0;
  }
}
