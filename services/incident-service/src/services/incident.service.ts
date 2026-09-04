import { IncidentSeverity, IncidentStatus, TimelineEventType } from "@prisma/client";
import { assertCatalogService } from "../clients/catalog.client";
import { assertOrganizationMember } from "../clients/organization.client";
import { assertStatusTransition, transitionTimestamp } from "../domain/lifecycle";
import { AppError } from "../errors/AppError";
import { CommentRepository } from "../repositories/comment.repository";
import { IncidentFilters, IncidentRepository, TimelineInput } from "../repositories/incident.repository";

type Dependencies = {
  incidents?: IncidentRepository;
  comments?: CommentRepository;
  verifyService?: typeof assertCatalogService;
  verifyMember?: typeof assertOrganizationMember;
};

const pagination = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit)
});

export class IncidentService {
  private readonly incidents: IncidentRepository;
  private readonly comments: CommentRepository;
  private readonly verifyService: typeof assertCatalogService;
  private readonly verifyMember: typeof assertOrganizationMember;

  constructor(dependencies: Dependencies = {}) {
    this.incidents = dependencies.incidents ?? new IncidentRepository();
    this.comments = dependencies.comments ?? new CommentRepository();
    this.verifyService = dependencies.verifyService ?? assertCatalogService;
    this.verifyMember = dependencies.verifyMember ?? assertOrganizationMember;
  }

  async create(
    organizationId: string,
    actorUserId: string,
    authorization: string,
    input: { serviceId: string; title: string; description?: string; severity: IncidentSeverity }
  ) {
    await this.verifyService(organizationId, input.serviceId, authorization);
    return this.incidents.createWithTimeline(
      { organizationId, ...input, source: "MANUAL", createdByUserId: actorUserId },
      {
        type: TimelineEventType.INCIDENT_CREATED,
        actorUserId,
        message: "Incident created",
        metadata: { status: "TRIGGERED", severity: input.severity, serviceId: input.serviceId }
      }
    );
  }

  async list(organizationId: string, filters: IncidentFilters, page: number, limit: number) {
    const result = await this.incidents.list(organizationId, filters, page, limit);
    return { items: result.items, pagination: pagination(page, limit, result.total) };
  }

  async get(organizationId: string, incidentId: string) {
    const incident = await this.incidents.findScoped(organizationId, incidentId);
    if (!incident) throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    return incident;
  }

  async updateDetails(
    organizationId: string,
    incidentId: string,
    actorUserId: string,
    input: { title?: string; description?: string | null }
  ) {
    const incident = await this.get(organizationId, incidentId);
    const events: TimelineInput[] = [];
    if (input.title !== undefined && input.title !== incident.title) {
      events.push({
        type: TimelineEventType.TITLE_CHANGED,
        actorUserId,
        message: "Incident title changed",
        metadata: { from: incident.title, to: input.title }
      });
    }
    if (input.description !== undefined && input.description !== incident.description) {
      events.push({
        type: TimelineEventType.DESCRIPTION_CHANGED,
        actorUserId,
        message: "Incident description changed",
        metadata: { from: incident.description ?? "", to: input.description ?? "" }
      });
    }
    if (!events.length) return incident;
    const updated = await this.incidents.updateDetails(organizationId, incidentId, input, events);
    if (!updated) throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    return updated;
  }

  async updateStatus(organizationId: string, incidentId: string, actorUserId: string, status: IncidentStatus) {
    const incident = await this.get(organizationId, incidentId);
    assertStatusTransition(incident.status, status);
    const now = new Date();
    const updated = await this.incidents.changeStatus(
      organizationId,
      incidentId,
      incident.status,
      { status, ...transitionTimestamp(status, now) },
      {
        type: TimelineEventType.STATUS_CHANGED,
        actorUserId,
        message: `Incident status changed from ${incident.status} to ${status}`,
        metadata: { from: incident.status, to: status }
      }
    );
    if (!updated) throw new AppError(409, "INCIDENT_CHANGED", "Incident changed while the request was being processed; retry the operation");
    return updated;
  }

  async updateSeverity(organizationId: string, incidentId: string, actorUserId: string, severity: IncidentSeverity) {
    const incident = await this.get(organizationId, incidentId);
    if (incident.severity === severity) return incident;
    const updated = await this.incidents.changeSeverity(
      organizationId,
      incidentId,
      incident.severity,
      severity,
      {
        type: TimelineEventType.SEVERITY_CHANGED,
        actorUserId,
        message: `Incident severity changed from ${incident.severity} to ${severity}`,
        metadata: { from: incident.severity, to: severity }
      }
    );
    if (!updated) throw new AppError(409, "INCIDENT_CHANGED", "Incident changed while the request was being processed; retry the operation");
    return updated;
  }

  async updateAssignee(
    organizationId: string,
    incidentId: string,
    actorUserId: string,
    authorization: string,
    userId: string | null
  ) {
    const incident = await this.get(organizationId, incidentId);
    if (userId) await this.verifyMember(organizationId, userId, authorization);
    if (incident.assignedToUserId === userId) return incident;
    const updated = await this.incidents.changeAssignee(
      organizationId,
      incidentId,
      incident.assignedToUserId,
      userId,
      {
        type: TimelineEventType.ASSIGNEE_CHANGED,
        actorUserId,
        message: userId ? "Incident assigned" : "Incident unassigned",
        metadata: { from: incident.assignedToUserId ?? "", to: userId ?? "" }
      }
    );
    if (!updated) throw new AppError(409, "INCIDENT_CHANGED", "Incident changed while the request was being processed; retry the operation");
    return updated;
  }

  async listTimeline(organizationId: string, incidentId: string, page: number, limit: number) {
    await this.get(organizationId, incidentId);
    const result = await this.incidents.listTimeline(organizationId, incidentId, page, limit);
    return { items: result.items, pagination: pagination(page, limit, result.total) };
  }

  async addComment(organizationId: string, incidentId: string, authorUserId: string, body: string) {
    const comment = await this.comments.createWithTimeline(organizationId, incidentId, authorUserId, body);
    if (!comment) throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    return comment;
  }

  async listComments(organizationId: string, incidentId: string, page: number, limit: number) {
    await this.get(organizationId, incidentId);
    const result = await this.comments.list(organizationId, incidentId, page, limit);
    return { items: result.items, pagination: pagination(page, limit, result.total) };
  }

  async updateComment(organizationId: string, incidentId: string, commentId: string, actorUserId: string, body: string) {
    const comment = await this.comments.findScoped(organizationId, incidentId, commentId);
    if (!comment) throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found");
    if (comment.authorUserId !== actorUserId) throw new AppError(403, "COMMENT_AUTHOR_REQUIRED", "Only the comment author can edit this comment");
    await this.comments.update(organizationId, incidentId, commentId, body);
    return this.comments.findScoped(organizationId, incidentId, commentId);
  }

  async deleteComment(organizationId: string, incidentId: string, commentId: string, actorUserId: string) {
    const comment = await this.comments.findScoped(organizationId, incidentId, commentId);
    if (!comment) throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found");
    if (comment.authorUserId !== actorUserId) throw new AppError(403, "COMMENT_AUTHOR_REQUIRED", "Only the comment author can delete this comment");
    await this.comments.delete(organizationId, incidentId, commentId);
  }

  async deleteIncident(organizationId: string, incidentId: string) {
    if (!(await this.incidents.delete(organizationId, incidentId))) {
      throw new AppError(404, "INCIDENT_NOT_FOUND", "Incident not found");
    }
  }
}
