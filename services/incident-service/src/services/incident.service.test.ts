import { IncidentSeverity, IncidentSource, IncidentStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/AppError";
import { CommentRepository } from "../repositories/comment.repository";
import { IncidentRepository } from "../repositories/incident.repository";
import { IncidentService } from "./incident.service";

const incident = (overrides: Record<string, unknown> = {}) => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  organizationId: "550e8400-e29b-41d4-a716-446655440001",
  serviceId: "550e8400-e29b-41d4-a716-446655440002",
  title: "Payment failures",
  description: null,
  status: IncidentStatus.TRIGGERED,
  severity: IncidentSeverity.SEV1,
  source: IncidentSource.MANUAL,
  sourceAlertId: null,
  createdByUserId: "user-1",
  assignedToUserId: null,
  acknowledgedAt: null,
  investigatingAt: null,
  mitigatingAt: null,
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

const setup = (incidentOverrides: Record<string, unknown> = {}) => {
  const incidents = {
    findScoped: vi.fn().mockResolvedValue(incident(incidentOverrides)),
    createWithTimeline: vi.fn().mockResolvedValue(incident(incidentOverrides)),
    changeStatus: vi.fn().mockImplementation(async (_org, _id, _from, data) => incident({ ...incidentOverrides, ...data })),
    changeSeverity: vi.fn().mockImplementation(async (_org, _id, _from, severity) => incident({ ...incidentOverrides, severity })),
    changeAssignee: vi.fn().mockImplementation(async (_org, _id, _from, assignedToUserId) => incident({ ...incidentOverrides, assignedToUserId })),
    delete: vi.fn().mockResolvedValue(true)
  };
  const comments = { createWithTimeline: vi.fn(), findScoped: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const verifyService = vi.fn();
  const verifyMember = vi.fn();
  const publish = vi.fn();
  const service = new IncidentService({
    incidents: incidents as unknown as IncidentRepository,
    comments: comments as unknown as CommentRepository,
    verifyService,
    verifyMember,
    publish
  });
  return { service, incidents, comments, verifyService, verifyMember, publish };
};

describe("IncidentService", () => {
  it("looks up incidents with both tenant and incident ids", async () => {
    const { service, incidents } = setup();
    await service.get("org-a", "incident-a");
    expect(incidents.findScoped).toHaveBeenCalledWith("org-a", "incident-a");
  });

  it("rejects a cross-tenant or missing incident as 404", async () => {
    const { service, incidents } = setup();
    incidents.findScoped.mockResolvedValue(null);
    await expect(service.get("org-b", "incident-a")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("rejects invalid status jumps", async () => {
    const { service } = setup();
    await expect(service.updateStatus("org-a", "incident-a", "user-1", IncidentStatus.RESOLVED)).rejects.toBeInstanceOf(AppError);
  });

  it("writes the lifecycle timestamp with the status update", async () => {
    const { service, incidents, publish } = setup();
    await service.updateStatus("org-a", "incident-a", "user-1", IncidentStatus.ACKNOWLEDGED);
    expect(incidents.changeStatus.mock.calls[0][3]).toMatchObject({ status: "ACKNOWLEDGED", acknowledgedAt: expect.any(Date) });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ event: "incident:status-changed", room: "incident:incident-a" }));
  });

  it("verifies a non-null assignee through Organization Service", async () => {
    const { service, verifyMember } = setup();
    await service.updateAssignee("org-a", "incident-a", "user-1", "Bearer token", "user-2");
    expect(verifyMember).toHaveBeenCalledWith("org-a", "user-2", "Bearer token");
  });

  it("does not call Organization Service when unassigning", async () => {
    const { service, verifyMember } = setup({ assignedToUserId: "user-2" });
    await service.updateAssignee("org-a", "incident-a", "user-1", "Bearer token", null);
    expect(verifyMember).not.toHaveBeenCalled();
  });

  it("blocks an admin from editing another author's comment", async () => {
    const { service, comments } = setup();
    comments.findScoped.mockResolvedValue({ id: "comment-1", authorUserId: "other-user" });
    await expect(service.updateComment("org-a", "incident-a", "comment-1", "admin-user", "edited"))
      .rejects.toMatchObject({ statusCode: 403, code: "COMMENT_AUTHOR_REQUIRED" });
  });

  it("allows only the author to delete a comment", async () => {
    const { service, comments, publish } = setup();
    comments.findScoped.mockResolvedValue({ id: "comment-1", authorUserId: "user-1" });
    await service.deleteComment("org-a", "incident-a", "comment-1", "user-1");
    expect(comments.delete).toHaveBeenCalledWith("org-a", "incident-a", "comment-1");
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      event: "incident:comment-deleted",
      payload: expect.objectContaining({ commentId: "comment-1" })
    }));
  });

  it("publishes comment-added after the database operation succeeds", async () => {
    const { service, comments, publish } = setup();
    comments.createWithTimeline.mockResolvedValue({ id: "comment-1", authorUserId: "user-1", body: "Investigating" });
    await service.addComment("org-a", "incident-a", "user-1", "Investigating");
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ event: "incident:comment-added" }));
  });

  it("does not fail a committed mutation when realtime publishing fails", async () => {
    const { service, publish } = setup();
    publish.mockRejectedValue(new Error("Redis unavailable"));
    await expect(service.updateStatus("org-a", "incident-a", "user-1", IncidentStatus.ACKNOWLEDGED))
      .resolves.toMatchObject({ status: IncidentStatus.ACKNOWLEDGED });
  });
});
