import { IncidentSeverity, IncidentStatus } from "@prisma/client";
import { z } from "zod";

const uuid = z.uuid();
const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
};

export const organizationParamsSchema = z.object({ organizationId: uuid });
export const incidentParamsSchema = z.object({ organizationId: uuid, incidentId: uuid });
export const commentParamsSchema = z.object({ organizationId: uuid, incidentId: uuid, commentId: uuid });

export const createIncidentSchema = z.object({
  serviceId: uuid,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).optional(),
  severity: z.enum(IncidentSeverity)
}).strict();

export const updateIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10_000).nullable().optional()
}).strict().refine((body) => body.title !== undefined || body.description !== undefined, "At least one field is required");

export const updateStatusSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "INVESTIGATING", "MITIGATING", "RESOLVED"])
}).strict();

export const updateSeveritySchema = z.object({ severity: z.enum(IncidentSeverity) }).strict();
export const updateAssigneeSchema = z.object({ userId: uuid.nullable() }).strict();
export const commentSchema = z.object({ body: z.string().trim().min(1).max(10_000) }).strict();

export const listIncidentsSchema = z.object({
  ...pagination,
  status: z.enum(IncidentStatus).optional(),
  severity: z.enum(IncidentSeverity).optional(),
  serviceId: uuid.optional(),
  assignedToUserId: uuid.optional()
}).strict();

export const listEntriesSchema = z.object(pagination).strict();
