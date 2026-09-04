import { OrganizationRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../errors/AppError";
import { OrganizationRepository } from "../repositories/organization.repository";
import { requireOrgRole } from "./requireOrgRole";

const request = (): Request => ({
  params: { id: "org-1" },
  user: { id: "user-1", email: "akash@example.com", sessionId: "session-1" }
} as unknown as Request);

const response = {} as Response;

describe("requireOrgRole", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns 404 for a non-member without revealing the organization", async () => {
    vi.spyOn(OrganizationRepository.prototype, "findMembership").mockResolvedValue(null);
    const next = vi.fn() as unknown as NextFunction;

    await requireOrgRole()(request(), response, next);

    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe("ORGANIZATION_NOT_FOUND");
  });

  it("returns 403 when a member lacks an allowed role", async () => {
    vi.spyOn(OrganizationRepository.prototype, "findMembership").mockResolvedValue({
      id: "member-1",
      organizationId: "org-1",
      userId: "user-1",
      role: OrganizationRole.VIEWER,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const next = vi.fn() as unknown as NextFunction;

    await requireOrgRole([OrganizationRole.OWNER])(request(), response, next);

    const error = (next as ReturnType<typeof vi.fn>).mock.calls[0][0] as AppError;
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe("INSUFFICIENT_ROLE");
  });

  it("attaches a safe membership for an allowed member", async () => {
    vi.spyOn(OrganizationRepository.prototype, "findMembership").mockResolvedValue({
      id: "member-1",
      organizationId: "org-1",
      userId: "user-1",
      role: OrganizationRole.ADMIN,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const req = request();
    const next = vi.fn() as unknown as NextFunction;

    await requireOrgRole([OrganizationRole.ADMIN])(req, response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.membership).toEqual({ organizationId: "org-1", userId: "user-1", role: OrganizationRole.ADMIN });
  });
});

